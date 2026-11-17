CREATE OR REPLACE FUNCTION public.pay_pdv_kitchen(order_id text, payment_method text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE o jsonb; snapshot jsonb;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO o FROM jsonb_array_elements(snapshot->'orders') value WHERE value->>'id'=order_id;
 IF o IS NULL THEN RAISE EXCEPTION 'Comanda não encontrada'; END IF;
 PERFORM public.pay_pdv_cashier(order_id,payment_method);
 IF o->>'status' IN ('aberta','cozinha','pronto','pago') THEN
  IF o->>'type'='Delivery' THEN
   IF EXISTS(SELECT 1 FROM public.delivery_orders WHERE delivery_orders.order_id=pay_pdv_kitchen.order_id AND status NOT IN ('Entregue','Cancelado')) THEN
    IF o->>'status'='aberta' THEN PERFORM public.advance_pdv_cashier_order(order_id,'cozinha'); END IF;
    PERFORM public.depart_delivery(order_id,NULL);
   END IF;
  ELSE
   SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
   UPDATE public.pdv_state SET data=jsonb_set(snapshot,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=order_id THEN value||jsonb_build_object('status','retirado') ELSE value END) FROM jsonb_array_elements(snapshot->'orders'))),revision=revision+1,updated_at=now() WHERE id=1;
  END IF;
 END IF;
END $function$;
REVOKE ALL ON FUNCTION public.pay_pdv_kitchen(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pay_pdv_kitchen(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_pdv_cashier_direct_paid(request jsonb, payment_method text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE result jsonb; snapshot jsonb; created jsonb; final text;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF nullif(trim(coalesce(payment_method,'')),'') IS NULL THEN RAISE EXCEPTION 'Selecione a forma de pagamento'; END IF;
 IF request->>'type' IS NULL OR request->>'type' NOT IN ('Balcão','Mesa','Retirada','Delivery') THEN RAISE EXCEPTION 'Tipo de pedido inválido'; END IF;
 final=CASE WHEN request->>'type'='Delivery' THEN 'entrega' ELSE 'retirado' END;
 result=public.submit_pdv_cashier_paid(request,payment_method);
 PERFORM pg_advisory_xact_lock(742021);
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO created FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) value WHERE value->>'id'=request->>'id';
 IF created IS NULL THEN RAISE EXCEPTION 'Não foi possível localizar o pedido criado'; END IF;
 IF NOT (created->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(created->'payments','[]'::jsonb))>0) THEN RAISE EXCEPTION 'Pagamento não confirmado'; END IF;
 IF created->>'status' IN ('retirado','entrega') THEN RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','status',created->>'status','directSale',true); END IF;
 IF created->>'status'<>'cozinha' THEN RAISE EXCEPTION 'Pedido não disponível para venda direta'; END IF;
 IF final='entrega' THEN
  PERFORM public.depart_delivery(request->>'id',NULL);
 ELSE
  UPDATE public.pdv_state SET data=jsonb_set(snapshot,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=request->>'id' THEN value||jsonb_build_object('status','retirado') ELSE value END) FROM jsonb_array_elements(snapshot->'orders'))),revision=revision+1,updated_at=now() WHERE id=1;
 END IF;
 RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','status',final,'directSale',true);
END $function$;
REVOKE ALL ON FUNCTION public.submit_pdv_cashier_direct_paid(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_cashier_direct_paid(jsonb,text) TO authenticated;