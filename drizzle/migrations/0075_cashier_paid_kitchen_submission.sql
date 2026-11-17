CREATE OR REPLACE FUNCTION public.submit_pdv_cashier_paid(request jsonb, payment_method text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE result jsonb; created jsonb;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF nullif(trim(coalesce(payment_method,'')),'') IS NULL THEN RAISE EXCEPTION 'Selecione a forma de pagamento'; END IF;
 result=public.submit_pdv_operator_with_contact(request);
 SELECT value INTO created
 FROM jsonb_array_elements(coalesce((SELECT data FROM public.pdv_state WHERE id=1)->'orders','[]'::jsonb)) value
 WHERE value->>'id'=request->>'id';
 IF created IS NULL THEN RAISE EXCEPTION 'Não foi possível localizar o pedido criado'; END IF;
 IF NOT (created->>'status'='pago' OR created->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(created->'payments','[]'::jsonb))>0) THEN
  PERFORM public.pay_pdv_cashier(request->>'id',payment_method);
 END IF;
 RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','number',created->'number','paymentStatus','pago');
END $function$;
REVOKE ALL ON FUNCTION public.submit_pdv_cashier_paid(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_cashier_paid(jsonb,text) TO authenticated;