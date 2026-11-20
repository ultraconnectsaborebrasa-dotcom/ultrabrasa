CREATE OR REPLACE FUNCTION public.update_delivery_status(delivery_id uuid,new_status text,issue text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE d public.delivery_orders;
BEGIN
 PERFORM pg_advisory_xact_lock(742021); SELECT * INTO d FROM public.delivery_orders WHERE id=delivery_id FOR UPDATE;
 IF d.id IS NULL OR (NOT public.delivery_staff() AND NOT (public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_routes r JOIN public.delivery_couriers c ON c.id=r.courier_id WHERE r.id=d.route_id AND c.user_id=auth.uid() AND c.active))) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF d.status IN ('Entregue','Cancelado') THEN RAISE EXCEPTION 'Entrega encerrada'; END IF;
 IF issue IS NOT NULL THEN IF trim(issue)='' THEN RAISE EXCEPTION 'Descreva o problema'; END IF; UPDATE public.delivery_orders SET problem=left(issue,1000),arrived_at=NULL WHERE id=d.id; RETURN; END IF;
 IF new_status IS DISTINCT FROM 'Entregue' THEN RAISE EXCEPTION 'Status inválido'; END IF;
 UPDATE public.delivery_orders SET status='Entregue',delivered_at=now() WHERE id=d.id;
 UPDATE public.pdv_state SET data=jsonb_set(data,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=d.order_id AND value->>'status' IN ('entrega','pronto','cozinha') THEN value||jsonb_build_object('status','entregue') ELSE value END) FROM jsonb_array_elements(data->'orders'))),revision=revision+1,updated_at=now() WHERE id=1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(data->'orders') v WHERE v->>'id'=d.order_id AND v->>'status' IN ('entrega','pronto','cozinha'));
END;
$$;