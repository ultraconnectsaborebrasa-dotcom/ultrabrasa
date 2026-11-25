ALTER TABLE public.delivery_orders ADD COLUMN customer_paid_reported_at timestamptz, ADD COLUMN customer_paid_reported_by uuid;
CREATE FUNCTION public.report_delivery_customer_paid(p_order_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.delivery_orders; o jsonb; cid uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Somente o entregador pode informar'; END IF;
 SELECT value INTO o FROM public.pdv_state s CROSS JOIN LATERAL jsonb_array_elements(s.data->'orders') value WHERE s.id=1 AND value->>'id'=p_order_id;
 PERFORM 1 FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT * INTO d FROM public.delivery_orders WHERE order_id=p_order_id FOR UPDATE;
 SELECT coalesce(r.courier_id,d.assigned_courier_id) INTO cid FROM (SELECT 1) x LEFT JOIN public.delivery_routes r ON r.id=d.route_id;
 IF d.id IS NULL OR d.status IN ('Cancelado','Entregue') OR NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=cid AND user_id=auth.uid() AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Pedido indisponível para esta conta'; END IF;
 IF o IS NULL OR o->>'status' IN ('cancelado','pago') OR o->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(o->'payments','[]'))>0 THEN RAISE EXCEPTION 'Pedido já pago ou cancelado'; END IF;
 UPDATE public.delivery_orders SET customer_paid_reported_at=coalesce(customer_paid_reported_at,now()),customer_paid_reported_by=coalesce(customer_paid_reported_by,auth.uid()) WHERE id=d.id;
END $$;
REVOKE ALL ON FUNCTION public.report_delivery_customer_paid(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_delivery_customer_paid(text) TO authenticated;
CREATE FUNCTION public.read_delivery_payment_review(p_day date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result=public.read_delivery_receivables(p_day);
 RETURN jsonb_set(result,'{orders}',coalesce((SELECT jsonb_agg(o || jsonb_build_object('customer_paid_reported_at',d.customer_paid_reported_at)) FROM jsonb_array_elements(result->'orders') o JOIN public.delivery_orders d ON d.order_id=o->>'id'),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.read_delivery_payment_review(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_delivery_payment_review(date) TO authenticated;
CREATE FUNCTION public.guard_customer_paid_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_orders d JOIN LATERAL (SELECT value o FROM jsonb_array_elements(NEW.data->'orders') value WHERE value->>'id'=d.order_id) n ON true JOIN LATERAL (SELECT value o FROM jsonb_array_elements(OLD.data->'orders') value WHERE value->>'id'=d.order_id) prev ON true WHERE d.customer_paid_reported_at IS NOT NULL AND coalesce(prev.o->>'paymentStatus','')<>'pago' AND (n.o->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(n.o->'payments','[]'))>jsonb_array_length(coalesce(prev.o->'payments','[]')))) THEN RAISE EXCEPTION 'Cliente informou pagamento: Caixa ou Administrador precisa conferir'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_customer_paid_review BEFORE UPDATE ON public.pdv_state FOR EACH ROW EXECUTE FUNCTION public.guard_customer_paid_review();
CREATE TABLE public.courier_push_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),delivery_id uuid NOT NULL REFERENCES public.delivery_orders(id) ON DELETE CASCADE,courier_id uuid NOT NULL REFERENCES public.delivery_couriers(id) ON DELETE CASCADE,state text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now(),leased_at timestamptz,error text,UNIQUE(delivery_id,courier_id));
GRANT ALL ON public.courier_push_jobs TO service_role;
ALTER TABLE public.courier_push_jobs ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.enqueue_courier_delivery_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid;
BEGIN
 IF NEW.status IN ('Pronto para entrega','Em rota') THEN
 SELECT coalesce(r.courier_id,NEW.assigned_courier_id) INTO cid FROM (SELECT 1) x LEFT JOIN public.delivery_routes r ON r.id=NEW.route_id;
 IF cid IS NOT NULL THEN INSERT INTO public.courier_push_jobs(delivery_id,courier_id) VALUES(NEW.id,cid) ON CONFLICT DO NOTHING; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enqueue_courier_delivery_push AFTER INSERT OR UPDATE OF route_id,assigned_courier_id,status ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_courier_delivery_push();
CREATE FUNCTION public.enqueue_route_courier_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.courier_id IS DISTINCT FROM OLD.courier_id AND NEW.courier_id IS NOT NULL THEN INSERT INTO public.courier_push_jobs(delivery_id,courier_id) SELECT id,NEW.courier_id FROM public.delivery_orders WHERE route_id=NEW.id AND status IN ('Pronto para entrega','Em rota') ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enqueue_route_courier_push AFTER UPDATE OF courier_id ON public.delivery_routes FOR EACH ROW EXECUTE FUNCTION public.enqueue_route_courier_push();
CREATE FUNCTION public.lease_courier_push_jobs() RETURNS TABLE(job_id uuid,device_id uuid,token text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.courier_push_jobs SET state='expired' WHERE state='pending' AND created_at<now()-interval '15 minutes';
 RETURN QUERY WITH candidates AS (SELECT j.id,dev.id did,dev.fcm_token FROM public.courier_push_jobs j JOIN public.delivery_orders d ON d.id=j.delivery_id LEFT JOIN public.delivery_routes r ON r.id=d.route_id JOIN public.delivery_couriers c ON c.id=j.courier_id AND c.active AND c.deleted_at IS NULL JOIN public.courier_android_devices dev ON dev.courier_id=c.id AND NOT dev.revoked AND dev.expires_at>now() AND length(dev.fcm_token)>0 WHERE j.state='pending' AND coalesce(r.courier_id,d.assigned_courier_id)=j.courier_id AND d.status IN ('Pronto para entrega','Em rota') AND public.has_role(c.user_id,'courier') AND EXISTS(SELECT 1 FROM public.courier_time_entries WHERE courier_id=c.id AND exit_at IS NULL) ORDER BY j.created_at LIMIT 10 FOR UPDATE OF j SKIP LOCKED), leased AS (UPDATE public.courier_push_jobs j SET state='sending',leased_at=now() FROM candidates c WHERE j.id=c.id RETURNING j.id) SELECT l.id,c.did,c.fcm_token FROM leased l JOIN candidates c ON c.id=l.id;
END $$;
REVOKE ALL ON FUNCTION public.lease_courier_push_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lease_courier_push_jobs() TO service_role;
CREATE FUNCTION public.register_courier_push_token(p_secret_hash text,p_token text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(p_token)<10 OR length(p_token)>4096 OR p_token IS NULL THEN RAISE EXCEPTION 'Registro inválido'; END IF;
 UPDATE public.courier_android_devices dev SET fcm_token=p_token WHERE secret_hash=p_secret_hash AND NOT revoked AND expires_at>now() AND EXISTS(SELECT 1 FROM public.delivery_couriers c WHERE c.id=dev.courier_id AND c.active AND c.deleted_at IS NULL AND public.has_role(c.user_id,'courier'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Aparelho sem autorização'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.register_courier_push_token(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_courier_push_token(text,text) TO service_role;