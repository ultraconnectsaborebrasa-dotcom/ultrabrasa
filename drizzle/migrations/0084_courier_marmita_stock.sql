CREATE TABLE public.courier_marmita_stock (
 courier_id uuid PRIMARY KEY REFERENCES public.delivery_couriers(id) ON DELETE CASCADE,
 initial_quantity integer NOT NULL,
 remaining_quantity integer NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
GRANT SELECT ON public.courier_marmita_stock TO authenticated;
GRANT ALL ON public.courier_marmita_stock TO service_role;
ALTER TABLE public.courier_marmita_stock ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.courier_marmita_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 courier_id uuid NOT NULL REFERENCES public.delivery_couriers(id) ON DELETE CASCADE,
 delivery_id uuid REFERENCES public.delivery_orders(id) ON DELETE SET NULL,
 quantity_change integer NOT NULL,
 resulting_quantity integer NOT NULL,
 kind text NOT NULL,
 actor_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(delivery_id)
);
GRANT SELECT ON public.courier_marmita_movements TO authenticated;
GRANT ALL ON public.courier_marmita_movements TO service_role;
ALTER TABLE public.courier_marmita_movements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.delivery_marmita_quantity(p_order_id text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
 SELECT coalesce(sum((item->>'qty')::integer),0)::integer
 FROM public.pdv_state state,
 jsonb_array_elements(coalesce(state.data->'orders','[]'::jsonb)) orders(value),
 jsonb_array_elements(coalesce(orders.value->'items','[]'::jsonb)) item
 WHERE state.id=1 AND orders.value->>'id'=p_order_id
 AND position('marmita' in lower(coalesce(item->>'name','')))>0;
$$;
REVOKE ALL ON FUNCTION public.delivery_marmita_quantity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_marmita_quantity(text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_courier_marmita_stock(p_courier_id uuid,p_quantity integer,p_mode text DEFAULT 'load')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE previous public.courier_marmita_stock; reserved integer; next_initial integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente o administrador pode registrar a carga'; END IF;
 IF p_quantity IS NULL OR p_quantity<0 OR p_quantity>999 OR p_mode NOT IN ('load','correct') THEN RAISE EXCEPTION 'Informe uma quantidade válida entre 0 e 999'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=p_courier_id AND active) THEN RAISE EXCEPTION 'Entregador indisponível'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0)::integer INTO reserved
 FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id
 WHERE d.status NOT IN ('Entregue','Cancelado') AND coalesce(r.courier_id,d.assigned_courier_id)=p_courier_id;
 IF p_mode='load' AND reserved>0 THEN RAISE EXCEPTION 'Este entregador tem % marmita(s) reservada(s). Conclua as entregas ou use Corrigir saldo.',reserved; END IF;
 SELECT * INTO previous FROM public.courier_marmita_stock WHERE courier_id=p_courier_id FOR UPDATE;
 next_initial=CASE WHEN p_mode='load' OR previous.courier_id IS NULL THEN p_quantity ELSE greatest(p_quantity,previous.initial_quantity+p_quantity-previous.remaining_quantity) END;
 INSERT INTO public.courier_marmita_stock(courier_id,initial_quantity,remaining_quantity,updated_by)
 VALUES(p_courier_id,next_initial,p_quantity,auth.uid())
 ON CONFLICT(courier_id) DO UPDATE SET initial_quantity=EXCLUDED.initial_quantity,remaining_quantity=EXCLUDED.remaining_quantity,updated_at=now(),updated_by=auth.uid();
 INSERT INTO public.courier_marmita_movements(courier_id,quantity_change,resulting_quantity,kind,actor_id)
 VALUES(p_courier_id,p_quantity-coalesce(previous.remaining_quantity,0),p_quantity,p_mode,auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.set_courier_marmita_stock(uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_courier_marmita_stock(uuid,integer,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.deduct_courier_marmita_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE own uuid; route_courier uuid; quantity integer; movement_id uuid; balance integer;
BEGIN
 SELECT courier_id INTO route_courier FROM public.delivery_routes WHERE id=NEW.route_id;
 own=coalesce(route_courier,NEW.assigned_courier_id);
 IF own IS NULL THEN RETURN NEW; END IF;
 quantity=public.delivery_marmita_quantity(NEW.order_id);
 IF quantity<=0 THEN RETURN NEW; END IF;
 SELECT remaining_quantity INTO balance FROM public.courier_marmita_stock WHERE courier_id=own FOR UPDATE;
 IF balance IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.courier_marmita_movements(courier_id,delivery_id,quantity_change,resulting_quantity,kind,actor_id)
 VALUES(own,NEW.id,-quantity,balance-quantity,'delivery',auth.uid())
 ON CONFLICT(delivery_id) DO NOTHING RETURNING id INTO movement_id;
 IF movement_id IS NULL THEN RETURN NEW; END IF;
 UPDATE public.courier_marmita_stock SET remaining_quantity=remaining_quantity-quantity,updated_at=now(),updated_by=auth.uid() WHERE courier_id=own;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS courier_marmita_delivery_deduction ON public.delivery_orders;
CREATE TRIGGER courier_marmita_delivery_deduction
AFTER UPDATE OF status ON public.delivery_orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status='Entregue')
EXECUTE FUNCTION public.deduct_courier_marmita_stock();

CREATE OR REPLACE FUNCTION public.save_delivery_route(route_id uuid DEFAULT NULL::uuid, route_name text DEFAULT ''::text, courier uuid DEFAULT NULL::uuid, origin_address text DEFAULT ''::text, stops uuid[] DEFAULT '{}'::uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ DECLARE rid uuid; cnt integer; required integer; reserved integer; balance integer; BEGIN
IF NOT public.delivery_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF; PERFORM pg_advisory_xact_lock(742021);
IF array_length(stops,1) IS NULL OR array_length(stops,1)>100 OR trim(route_name)='' THEN RAISE EXCEPTION 'Selecione pedidos e nomeie a rota'; END IF;
IF courier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=courier AND active) THEN RAISE EXCEPTION 'Entregador indisponível'; END IF;
IF route_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_routes r JOIN public.delivery_orders d ON d.route_id=r.id WHERE r.id=save_delivery_route.route_id AND d.status NOT IN ('Entregue','Cancelado')) THEN RAISE EXCEPTION 'Rota encerrada'; END IF;
IF route_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.delivery_orders d WHERE d.route_id=save_delivery_route.route_id AND d.status NOT IN ('Aguardando preparo','Pronto para entrega')) THEN RAISE EXCEPTION 'Rota já iniciada ou encerrada'; END IF; PERFORM 1 FROM public.delivery_orders WHERE id=ANY(stops) FOR UPDATE;
SELECT count(*) INTO cnt FROM public.delivery_orders d WHERE id=ANY(stops) AND status IN ('Aguardando preparo','Pronto para entrega') AND (d.route_id IS NULL OR d.route_id=save_delivery_route.route_id);
IF cnt<>cardinality(stops) THEN RAISE EXCEPTION 'Pedido indisponível ou já atribuído a outra rota'; END IF;
PERFORM public.validate_delivery_input(jsonb_build_object('address',d.address)) FROM public.delivery_orders d WHERE d.id=ANY(stops);
IF courier IS NOT NULL THEN
 SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0)::integer INTO required FROM public.delivery_orders d WHERE d.id=ANY(stops);
 IF required>0 THEN
  SELECT remaining_quantity INTO balance FROM public.courier_marmita_stock WHERE courier_id=save_delivery_route.courier FOR UPDATE;
  IF balance IS NULL THEN RAISE EXCEPTION 'Registre a carga de marmitas deste entregador antes de designar a rota'; END IF;
  SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0)::integer INTO reserved
  FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id
  WHERE d.status NOT IN ('Entregue','Cancelado') AND coalesce(r.courier_id,d.assigned_courier_id)=save_delivery_route.courier
  AND (save_delivery_route.route_id IS NULL OR d.route_id IS DISTINCT FROM save_delivery_route.route_id);
  IF required>balance-reserved THEN RAISE EXCEPTION 'Marmitas insuficientes: % disponível(is) e % necessária(s) nesta rota',greatest(0,balance-reserved),required; END IF;
 END IF;
END IF;
rid=coalesce(route_id,gen_random_uuid()); INSERT INTO public.delivery_routes(id,name,courier_id,origin,created_by) VALUES(rid,left(route_name,120),courier,left(coalesce(origin_address,''),500),auth.uid()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,courier_id=EXCLUDED.courier_id,origin=EXCLUDED.origin;
UPDATE public.delivery_orders d SET route_id=NULL,position=0 WHERE d.route_id=rid;
UPDATE public.delivery_orders d SET route_id=rid,position=s.ordinality FROM unnest(stops) WITH ORDINALITY s(id,ordinality) WHERE d.id=s.id;
RETURN rid; END $function$;

CREATE OR REPLACE FUNCTION public.read_delivery_board()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ DECLARE snapshot jsonb; is_admin boolean; result jsonb; BEGIN
is_admin=public.has_role(auth.uid(),'admin'); IF NOT public.delivery_staff() AND NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
SELECT coalesce(jsonb_agg((CASE WHEN is_admin OR d.status NOT IN ('Entregue','Cancelado') THEN to_jsonb(d) ELSE to_jsonb(d)-'cash_for'-'payment_method' END)||jsonb_build_object('number',o->'number','items',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',i->>'name','qty',i->'qty','note',i->>'note')),'[]') FROM jsonb_array_elements(coalesce(o->'items','[]')) i),'courier_id',coalesce(r.courier_id,d.assigned_courier_id),'order_status',o->>'status','payment_status',CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(o->'payments','[]')) p WHERE p->>'verification'='unverified') THEN 'Pago — conferir comprovante' WHEN jsonb_array_length(coalesce(o->'payments','[]'))>0 THEN 'Pago' ELSE 'Pendente' END,'total',CASE WHEN is_admin OR d.status NOT IN ('Entregue','Cancelado') THEN t.total END,'due',CASE WHEN is_admin OR d.status NOT IN ('Entregue','Cancelado') THEN greatest(0,t.total-coalesce((SELECT sum((p->>'amount')::numeric) FROM jsonb_array_elements(coalesce(o->'payments','[]')) p),0)) END,'change',CASE WHEN is_admin OR d.status NOT IN ('Entregue','Cancelado') THEN greatest(0,d.cash_for-t.total) END) ORDER BY d.created_at DESC),'[]') INTO result
FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id LEFT JOIN LATERAL(SELECT value o FROM jsonb_array_elements(snapshot->'orders') WHERE value->>'id'=d.order_id) orders ON true
LEFT JOIN LATERAL(SELECT greatest(0,coalesce((SELECT sum((i->>'qty')::numeric*(i->>'price')::numeric) FROM jsonb_array_elements(coalesce(o->'items','[]')) i),0)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,0)) total) t ON true
WHERE is_admin OR public.delivery_staff() OR (public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_couriers c WHERE c.id=r.courier_id AND c.user_id=auth.uid() AND c.active));
RETURN jsonb_build_object('deliveries',result,'routes',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.delivery_routes r WHERE is_admin OR (public.delivery_staff() AND EXISTS(SELECT 1 FROM public.delivery_orders d WHERE d.route_id=r.id AND d.status NOT IN ('Entregue','Cancelado'))) OR (public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_couriers c WHERE c.id=r.courier_id AND c.user_id=auth.uid() AND c.active))),'[]'),'couriers',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('initial_quantity',s.initial_quantity,'remaining_quantity',s.remaining_quantity,'reserved_quantity',a.reserved,'available_quantity',CASE WHEN s.courier_id IS NULL THEN NULL ELSE s.remaining_quantity-a.reserved END,'stock_updated_at',s.updated_at)) FROM public.delivery_couriers c LEFT JOIN public.courier_marmita_stock s ON s.courier_id=c.id LEFT JOIN LATERAL(SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0)::integer reserved FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status NOT IN ('Entregue','Cancelado') AND coalesce(r.courier_id,d.assigned_courier_id)=c.id) a ON true WHERE public.delivery_staff() OR (public.has_role(auth.uid(),'courier') AND c.user_id=auth.uid() AND c.active)),'[]')); END $function$;