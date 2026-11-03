CREATE OR REPLACE FUNCTION public.confirm_receipt_payment(_id uuid,_method text DEFAULT 'Pix') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.payment_receipts; req public.whatsapp_order_requests; s jsonb; o jsonb; ps jsonb; name text; total numeric; already numeric; amt numeric; remaining numeric; m text:=coalesce(nullif(trim(_method),''),'Pix'); ts bigint:=floor(extract(epoch FROM now())*1000);
BEGIN
 IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT * INTO r FROM public.payment_receipts WHERE id=_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Comprovante não encontrado'; END IF;
 IF r.state='confirmed' THEN RETURN jsonb_build_object('already',true); END IF;
 SELECT * INTO req FROM public.whatsapp_order_requests WHERE id=r.request_id;
 SELECT data INTO s FROM public.pdv_state WHERE id=1 FOR UPDATE;
 IF coalesce((s->'cash'->>'open')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'CAIXA_FECHADO: abra o caixa antes de confirmar o pagamento'; END IF;
 IF jsonb_typeof(s->'paymentMethods')='array' AND NOT (s->'paymentMethods') ? m THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;
 SELECT value INTO o FROM jsonb_array_elements(s->'orders') WHERE value->>'id'=coalesce(r.order_id,req.order_id);
 IF o IS NULL THEN RAISE EXCEPTION 'Vincule e aceite o pedido antes de confirmar o pagamento'; END IF;
 IF o->>'status'='cancelado' THEN RAISE EXCEPTION 'Pedido cancelado: resolver recebimento ou reembolso, sem reativar'; END IF;
 total:=greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(o->'items') i)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,0));
 SELECT coalesce(sum((p->>'amount')::numeric),0) INTO already FROM jsonb_array_elements(coalesce(o->'payments','[]')) p WHERE coalesce(p->>'verification','')<>'unverified' AND p->>'receiptId' IS DISTINCT FROM r.id::text;
 remaining:=greatest(0,total-already);
 IF remaining<=0.004 THEN RAISE EXCEPTION 'Pedido já está quitado: nada a receber'; END IF;
 amt:=round(least(coalesce(nullif(r.amount,0),remaining),remaining),2);
 SELECT display_name INTO name FROM public.profiles WHERE id=auth.uid();
 SELECT coalesce(jsonb_agg(p),'[]') INTO ps FROM jsonb_array_elements(coalesce(o->'payments','[]')) p WHERE p->>'receiptId' IS DISTINCT FROM r.id::text;
 ps:=ps||jsonb_build_array(jsonb_build_object('method',m,'amount',amt,'receiptId',r.id,'origin','Comprovante conferido no caixa','verification','confirmed','confirmedBy',auth.uid(),'confirmedByName',coalesce(name,'Atendente'),'confirmedAt',ts));
 UPDATE public.pdv_state SET data=jsonb_set(s,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=o->>'id' THEN value||jsonb_build_object('payments',ps,'paymentStatus',CASE WHEN remaining-amt<=0.004 THEN 'pago' ELSE 'pendente' END,'paidAt',CASE WHEN remaining-amt<=0.004 THEN to_jsonb(ts) ELSE coalesce(value->'paidAt','null'::jsonb) END,'cashierId',auth.uid()) ELSE value END) FROM jsonb_array_elements(s->'orders'))),revision=revision+1,updated_at=now() WHERE id=1;
 UPDATE public.payment_receipts SET state='confirmed',reviewed_at=now(),reviewed_by=auth.uid(),order_id=o->>'id' WHERE id=r.id;
 INSERT INTO public.payment_receipt_events(receipt_id,action,reason,actor,actor_name) VALUES(r.id,'Pagamento conferido e lançado no caixa',format('%s %s · saldo restante %s',m,amt,greatest(0,remaining-amt)),auth.uid(),coalesce(name,'Atendente'));
 RETURN jsonb_build_object('amount',amt,'remaining',greatest(0,remaining-amt),'paid',remaining-amt<=0.004);
END $$;
REVOKE ALL ON FUNCTION public.confirm_receipt_payment(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.confirm_receipt_payment(uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.open_pdv_cash(_initial numeric DEFAULT 0) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 UPDATE public.pdv_state SET data=jsonb_set(data,'{cash}',jsonb_build_object('open',true,'openedAt',floor(extract(epoch FROM now())*1000),'initial',greatest(0,coalesce(_initial,0)),'moves','[]'::jsonb)),revision=revision+1,updated_at=now() WHERE id=1 AND coalesce((data->'cash'->>'open')::boolean,false) IS NOT TRUE;
END $$;
REVOKE ALL ON FUNCTION public.open_pdv_cash(numeric) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.open_pdv_cash(numeric) TO authenticated,service_role;