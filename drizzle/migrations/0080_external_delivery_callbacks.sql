CREATE TABLE public.external_delivery_events(
 event_id uuid PRIMARY KEY,
 order_id text NOT NULL,
 external_delivery_id uuid NOT NULL,
 event text NOT NULL CHECK(event IN ('order.received','courier.assigned','courier.accepted','order.collected','delivery.started','delivery.completed','delivery.cancelled','delivery.failed')),
 revision integer NOT NULL CHECK(revision>=0),
 status text NOT NULL,
 occurred_at timestamptz NOT NULL,
 payload jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz
);
GRANT ALL ON public.external_delivery_events TO service_role;
ALTER TABLE public.external_delivery_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX external_delivery_events_order_revision_idx ON public.external_delivery_events(order_id,revision DESC);

CREATE FUNCTION public.apply_external_delivery_callback(
 p_event_id uuid,p_event text,p_revision integer,p_order_id text,p_delivery_id uuid,
 p_status text,p_occurred_at timestamptz,p_payload jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
 inserted_id uuid; latest_revision integer; snapshot jsonb; target jsonb;
 current_stage text; target_stage text;
BEGIN
 IF p_event NOT IN ('order.received','courier.assigned','courier.accepted','order.collected','delivery.started','delivery.completed','delivery.cancelled','delivery.failed') THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 IF p_revision<0 OR nullif(trim(p_order_id),'') IS NULL THEN RAISE EXCEPTION 'Retorno inválido'; END IF;
 PERFORM pg_advisory_xact_lock(742023);
 INSERT INTO public.external_delivery_events(event_id,order_id,external_delivery_id,event,revision,status,occurred_at,payload)
 VALUES(p_event_id,p_order_id,p_delivery_id,p_event,p_revision,left(p_status,120),p_occurred_at,p_payload)
 ON CONFLICT(event_id) DO NOTHING RETURNING event_id INTO inserted_id;
 IF inserted_id IS NULL THEN RETURN 'duplicate'; END IF;
 SELECT max(revision) INTO latest_revision FROM public.external_delivery_events WHERE order_id=p_order_id AND event_id<>p_event_id;
 IF latest_revision IS NOT NULL AND p_revision<=latest_revision THEN
  UPDATE public.external_delivery_events SET processed_at=now() WHERE event_id=p_event_id;
  RETURN 'stale';
 END IF;
 PERFORM pg_advisory_xact_lock(742021);
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO target FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) value WHERE value->>'id'=p_order_id;
 IF target IS NULL OR target->>'type'<>'Delivery' THEN RAISE EXCEPTION 'Pedido Delivery não encontrado'; END IF;
 target_stage=CASE p_event WHEN 'delivery.started' THEN 'entrega' WHEN 'delivery.completed' THEN 'entregue' WHEN 'delivery.cancelled' THEN 'cancelado' ELSE NULL END;
 IF p_event='delivery.failed' THEN
  UPDATE public.delivery_orders SET problem=left(p_status,1000) WHERE order_id=p_order_id AND status NOT IN ('Entregue','Cancelado');
 END IF;
 IF target_stage IS NULL THEN
  UPDATE public.external_delivery_events SET processed_at=now() WHERE event_id=p_event_id;
  RETURN 'recorded';
 END IF;
 current_stage=target->>'status';
 IF current_stage IN ('entregue','retirado','cancelado') AND current_stage<>target_stage THEN
  UPDATE public.external_delivery_events SET processed_at=now() WHERE event_id=p_event_id;
  RETURN 'closed';
 END IF;
 IF current_stage IS DISTINCT FROM target_stage THEN
  UPDATE public.pdv_state SET data=jsonb_set(snapshot,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=p_order_id THEN value||jsonb_build_object('status',target_stage) ELSE value END) FROM jsonb_array_elements(snapshot->'orders') value)),revision=revision+1,updated_at=now() WHERE id=1;
 END IF;
 IF p_event='delivery.started' THEN
  UPDATE public.delivery_orders SET status='Em rota',departed_at=coalesce(departed_at,p_occurred_at) WHERE order_id=p_order_id AND status NOT IN ('Entregue','Cancelado');
 ELSIF p_event='delivery.completed' THEN
  UPDATE public.delivery_orders SET status='Entregue',delivered_at=coalesce(delivered_at,p_occurred_at) WHERE order_id=p_order_id AND status<>'Cancelado';
 ELSIF p_event='delivery.cancelled' THEN
  UPDATE public.delivery_orders SET status='Cancelado' WHERE order_id=p_order_id AND status<>'Entregue';
 END IF;
 UPDATE public.external_delivery_events SET processed_at=now() WHERE event_id=p_event_id;
 RETURN 'applied';
END $function$;
REVOKE ALL ON FUNCTION public.apply_external_delivery_callback(uuid,text,integer,text,uuid,text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_external_delivery_callback(uuid,text,integer,text,uuid,text,timestamptz,jsonb) TO service_role;