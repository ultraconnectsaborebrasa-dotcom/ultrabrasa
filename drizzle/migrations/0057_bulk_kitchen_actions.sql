CREATE OR REPLACE FUNCTION public.bulk_advance_pdv_cashier_orders(action text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE snapshot jsonb; changed integer := 0;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF action NOT IN ('ready','finish') THEN RAISE EXCEPTION 'Ação inválida'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 IF action='ready' THEN
  SELECT count(*) INTO changed FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) o WHERE o.value->>'status'='cozinha';
 ELSE
  SELECT count(*) INTO changed FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) o WHERE o.value->>'status' IN ('aberta','cozinha','pronto','entrega');
 END IF;
 IF changed=0 THEN RETURN 0; END IF;
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(
  CASE
   WHEN action='ready' AND o.value->>'status'='cozinha' THEN o.value||jsonb_build_object('status','pronto')
   WHEN action='finish' AND o.value->>'status' IN ('aberta','cozinha','pronto','entrega') THEN o.value||jsonb_build_object('status',CASE WHEN o.value->>'type'='Delivery' THEN 'entregue' ELSE 'retirado' END)
   ELSE o.value
  END
 )) INTO snapshot FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) o;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
 RETURN changed;
END $function$;
REVOKE ALL ON FUNCTION public.bulk_advance_pdv_cashier_orders(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bulk_advance_pdv_cashier_orders(text) TO authenticated;