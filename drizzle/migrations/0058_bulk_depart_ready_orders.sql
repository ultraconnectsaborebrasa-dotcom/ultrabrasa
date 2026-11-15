CREATE OR REPLACE FUNCTION public.bulk_depart_ready_orders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE snapshot jsonb; ids text[]; changed integer;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT array_agg(o->>'id' ORDER BY ordinality) INTO ids FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) WITH ORDINALITY AS items(o,ordinality) WHERE o->>'status'='pronto' AND o->>'type'='Delivery';
 changed=coalesce(cardinality(ids),0);
 IF changed=0 THEN RETURN 0; END IF;
 PERFORM id FROM public.delivery_orders WHERE order_id=ANY(ids) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM unnest(ids) AS selected(order_id) LEFT JOIN public.delivery_orders d ON d.order_id=selected.order_id WHERE d.id IS NULL OR d.status IN ('Entregue','Cancelado')) THEN RAISE EXCEPTION 'Há pedido pronto com entrega encerrada ou sem cadastro. Confira as rotas antes de enviar todos.'; END IF;
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN o->>'id'=ANY(ids) THEN o||jsonb_build_object('status','entrega') ELSE o END ORDER BY ordinality)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') WITH ORDINALITY AS items(o,ordinality);
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
 UPDATE public.delivery_orders SET status='Em rota',departed_at=coalesce(departed_at,now()) WHERE order_id=ANY(ids) AND status NOT IN ('Entregue','Cancelado');
 RETURN changed;
END $function$;
REVOKE ALL ON FUNCTION public.bulk_depart_ready_orders() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bulk_depart_ready_orders() TO authenticated;