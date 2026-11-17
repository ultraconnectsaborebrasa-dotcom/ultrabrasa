CREATE OR REPLACE FUNCTION public.pay_pdv_kitchen(order_id text, payment_method text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE current_status text; snapshot jsonb;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value->>'status' INTO current_status
 FROM jsonb_array_elements(snapshot->'orders') value
 WHERE value->>'id'=order_id;
 IF current_status IS NULL THEN RAISE EXCEPTION 'Comanda não encontrada'; END IF;
 PERFORM public.pay_pdv_cashier(order_id,payment_method);
 IF current_status='cozinha' THEN
  PERFORM public.advance_pdv_cashier_order(order_id,'pronto');
 END IF;
END $function$;
REVOKE ALL ON FUNCTION public.pay_pdv_kitchen(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pay_pdv_kitchen(text,text) TO authenticated;