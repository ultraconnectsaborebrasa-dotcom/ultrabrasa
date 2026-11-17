CREATE OR REPLACE FUNCTION public.submit_pdv_cashier_direct_paid(request jsonb, payment_method text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE result jsonb; snapshot jsonb; created jsonb;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF nullif(trim(coalesce(payment_method,'')),'') IS NULL THEN RAISE EXCEPTION 'Selecione a forma de pagamento'; END IF;
 IF request->>'type' NOT IN ('Balcão','Mesa','Retirada') OR request->>'type' IS NULL THEN RAISE EXCEPTION 'Venda direta disponível somente para Balcão, Mesa ou Retirada'; END IF;
 result=public.submit_pdv_cashier_paid(request,payment_method);
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO created FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) value WHERE value->>'id'=request->>'id';
 IF created IS NULL THEN RAISE EXCEPTION 'Não foi possível localizar o pedido criado'; END IF;
 IF NOT (created->>'status'='pago' OR created->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(created->'payments','[]'::jsonb))>0) THEN RAISE EXCEPTION 'Pagamento não confirmado'; END IF;
 IF created->>'status'='retirado' THEN RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','status','retirado','directSale',true); END IF;
 IF created->>'status'<>'cozinha' THEN RAISE EXCEPTION 'Pedido não disponível para venda direta'; END IF;
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN value->>'id'=request->>'id' THEN value||jsonb_build_object('status','retirado') ELSE value END)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') value;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
 RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','status','retirado','directSale',true);
END $function$;
REVOKE ALL ON FUNCTION public.submit_pdv_cashier_direct_paid(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_cashier_direct_paid(jsonb,text) TO authenticated;