CREATE TABLE public.external_delivery_outbox(
 order_id text PRIMARY KEY,
 version bigint NOT NULL DEFAULT 1,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','failed')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 leased_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.external_delivery_outbox TO service_role;
ALTER TABLE public.external_delivery_outbox ENABLE ROW LEVEL SECURITY;
CREATE INDEX external_delivery_outbox_available_idx ON public.external_delivery_outbox(state,available_at);

CREATE FUNCTION public.enqueue_external_delivery_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF TG_OP='INSERT' OR NEW.status='Pronto para entrega' AND OLD.status IS DISTINCT FROM NEW.status OR (NEW.customer,NEW.phone,NEW.address,NEW.payment_method,NEW.cash_for) IS DISTINCT FROM (OLD.customer,OLD.phone,OLD.address,OLD.payment_method,OLD.cash_for) THEN
  INSERT INTO public.external_delivery_outbox(order_id) VALUES(NEW.order_id)
  ON CONFLICT(order_id) DO UPDATE SET version=external_delivery_outbox.version+1,state='pending',attempts=0,available_at=now(),leased_at=NULL,last_error=NULL,updated_at=now();
 END IF;
 RETURN NEW;
END $function$;
CREATE TRIGGER external_delivery_order_outbox AFTER INSERT OR UPDATE ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_external_delivery_order();

CREATE FUNCTION public.lease_external_delivery_outbox(p_limit integer) RETURNS TABLE(order_id text,version bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 RETURN QUERY
 WITH candidates AS (
  SELECT o.order_id FROM public.external_delivery_outbox o
  WHERE o.available_at<=now() AND (o.state IN ('pending','failed') OR o.state='sending' AND o.leased_at<now()-interval '2 minutes')
  ORDER BY o.created_at LIMIT greatest(1,least(p_limit,10)) FOR UPDATE SKIP LOCKED
 ), leased AS (
  UPDATE public.external_delivery_outbox o SET state='sending',attempts=o.attempts+1,leased_at=now(),updated_at=now()
  WHERE o.order_id IN (SELECT order_id FROM candidates) RETURNING o.order_id,o.version
 ) SELECT * FROM leased;
END $function$;
REVOKE ALL ON FUNCTION public.lease_external_delivery_outbox(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lease_external_delivery_outbox(integer) TO service_role;

CREATE FUNCTION public.complete_external_delivery_outbox(p_order_id text,p_version bigint,p_ok boolean,p_error text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF p_ok THEN
  DELETE FROM public.external_delivery_outbox WHERE order_id=p_order_id AND version=p_version;
  UPDATE public.external_delivery_outbox SET state='pending',available_at=now(),leased_at=NULL,updated_at=now() WHERE order_id=p_order_id;
 ELSE
  UPDATE public.external_delivery_outbox SET state=CASE WHEN version=p_version THEN 'failed' ELSE 'pending' END,
   available_at=CASE WHEN version=p_version THEN now()+least(interval '30 seconds'*attempts,interval '5 minutes') ELSE now() END,
   leased_at=NULL,last_error=CASE WHEN version=p_version THEN left(coalesce(p_error,'unavailable'),80) ELSE last_error END,updated_at=now()
  WHERE order_id=p_order_id;
 END IF;
END $function$;
REVOKE ALL ON FUNCTION public.complete_external_delivery_outbox(text,bigint,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_external_delivery_outbox(text,bigint,boolean,text) TO service_role;