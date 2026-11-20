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
 IF created->>'status' IS DISTINCT FROM 'pago' AND created->>'paymentStatus' IS DISTINCT FROM 'pago' AND jsonb_array_length(coalesce(created->'payments','[]'::jsonb))=0 THEN
  PERFORM public.pay_pdv_cashier(request->>'id',payment_method);
 END IF;
 RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','number',created->'number','paymentStatus','pago');
END $function$;
REVOKE ALL ON FUNCTION public.submit_pdv_cashier_paid(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_cashier_paid(jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_pdv_cashier_direct_paid(request jsonb, payment_method text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE result jsonb; snapshot jsonb; created jsonb; target_status text;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF nullif(trim(coalesce(payment_method,'')),'') IS NULL THEN RAISE EXCEPTION 'Selecione a forma de pagamento'; END IF;
 IF request->>'type' NOT IN ('Balcão','Mesa','Retirada','Delivery') OR request->>'type' IS NULL THEN RAISE EXCEPTION 'Tipo de venda inválido'; END IF;
 result=public.submit_pdv_cashier_paid(request,payment_method);
 PERFORM pg_advisory_xact_lock(742021);
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO created FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) value WHERE value->>'id'=request->>'id';
 IF created IS NULL THEN RAISE EXCEPTION 'Não foi possível localizar o pedido criado'; END IF;
 IF created->>'status' IS DISTINCT FROM 'pago' AND created->>'paymentStatus' IS DISTINCT FROM 'pago' AND jsonb_array_length(coalesce(created->'payments','[]'::jsonb))=0 THEN RAISE EXCEPTION 'Pagamento não confirmado'; END IF;
 target_status=CASE WHEN request->>'type'='Delivery' THEN 'pronto' ELSE 'retirado' END;
 IF created->>'status'=target_status THEN RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','status',target_status,'directSale',true); END IF;
 IF created->>'status'<>'cozinha' THEN RAISE EXCEPTION 'Pedido não disponível para recebimento direto'; END IF;
 UPDATE public.pdv_state SET data=jsonb_set(snapshot,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=request->>'id' THEN value||jsonb_build_object('status',target_status) ELSE value END) FROM jsonb_array_elements(snapshot->'orders') value)),revision=revision+1,updated_at=now() WHERE id=1;
 RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','status',target_status,'directSale',true);
END $function$;
REVOKE ALL ON FUNCTION public.submit_pdv_cashier_direct_paid(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_cashier_direct_paid(jsonb,text) TO authenticated;