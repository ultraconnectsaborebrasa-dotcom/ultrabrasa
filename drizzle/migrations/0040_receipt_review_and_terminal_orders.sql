CREATE TABLE public.payment_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL UNIQUE REFERENCES public.whatsapp_messages(id), phone text NOT NULL,
 request_id uuid REFERENCES public.whatsapp_order_requests(id), order_id text, storage_path text, file_hash text, transaction_id text,
 evidence jsonb NOT NULL DEFAULT '{}', state text NOT NULL DEFAULT 'review' CHECK(state IN ('review','unverified','confirmed','corrected')),
 reason text NOT NULL DEFAULT '', amount numeric NOT NULL DEFAULT 0, received_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by uuid
);
GRANT SELECT ON public.payment_receipts TO authenticated; GRANT ALL ON public.payment_receipts TO service_role;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY receipts_staff_read ON public.payment_receipts FOR SELECT TO authenticated USING(public.wa_staff());
CREATE INDEX receipts_hash ON public.payment_receipts(file_hash); CREATE INDEX receipts_transaction ON public.payment_receipts(transaction_id);
CREATE TABLE public.payment_receipt_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receipt_id uuid NOT NULL REFERENCES public.payment_receipts(id), action text NOT NULL, reason text NOT NULL DEFAULT '', actor uuid, actor_name text NOT NULL DEFAULT 'Automação', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_receipt_events TO authenticated; GRANT ALL ON public.payment_receipt_events TO service_role;
ALTER TABLE public.payment_receipt_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY receipt_events_staff_read ON public.payment_receipt_events FOR SELECT TO authenticated USING(public.wa_staff());
CREATE POLICY receipts_staff_files ON storage.objects FOR SELECT TO authenticated USING(bucket_id='payment-receipts' AND public.wa_staff());
ALTER TABLE public.whatsapp_order_requests ADD COLUMN closed_reason text, ADD COLUMN closed_at timestamptz, ADD COLUMN closed_by uuid, ADD COLUMN closed_by_name text;
CREATE OR REPLACE FUNCTION public.record_payment_receipt(_message uuid,_path text,_hash text,_evidence jsonb,_request uuid,_compatible boolean,_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mid public.whatsapp_messages; r public.whatsapp_order_requests; rid uuid; duplicate boolean; total numeric; s jsonb; o jsonb; receipt_payment jsonb; enabled boolean; final_state text='review';
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT id INTO rid FROM public.payment_receipts WHERE message_id=_message; IF rid IS NOT NULL THEN RETURN rid; END IF;
 SELECT * INTO mid FROM public.whatsapp_messages WHERE id=_message AND direction='in'; IF mid.id IS NULL THEN RAISE EXCEPTION 'Mensagem inválida'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.payment_receipts WHERE (file_hash=_hash AND _hash IS NOT NULL) OR (transaction_id=nullif(_evidence->>'transactionId','') AND transaction_id IS NOT NULL)) INTO duplicate;
 SELECT * INTO r FROM public.whatsapp_order_requests WHERE id=_request AND phone=mid.phone FOR UPDATE;
 SELECT data INTO s FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO o FROM jsonb_array_elements(s->'orders') WHERE value->>'id'=r.order_id;
 SELECT coalesce((business->>'autoReceiptPayment')::boolean,false) INTO enabled FROM public.whatsapp_settings WHERE id=1;
 total=coalesce(r.quoted_total,0);
 IF r.id IS NULL OR duplicate OR r.status NOT IN ('awaiting_acceptance','accepted') OR o->>'status'='cancelado' OR coalesce(r.request->'delivery'->>'paymentMethod',r.request->>'payment') IS DISTINCT FROM 'Pix' OR _evidence->>'state' IS DISTINCT FROM 'completed' OR _evidence->>'isPixReceipt' IS DISTINCT FROM 'true' OR nullif(_evidence->>'amount','')::numeric IS DISTINCT FROM total OR nullif(_evidence->>'transactionId','') IS NULL OR _path IS NULL OR _hash IS NULL THEN _compatible=false; END IF;
 IF o IS NOT NULL AND jsonb_array_length(coalesce(o->'payments','[]'))>0 THEN _compatible=false; _reason='Pedido já possui pagamento: conferir sem duplicar'; END IF;
 IF duplicate THEN _reason='Possível reutilização de comprovante'; END IF;
 IF enabled AND _compatible THEN final_state='unverified'; END IF;
 INSERT INTO public.payment_receipts(message_id,phone,request_id,order_id,storage_path,file_hash,transaction_id,evidence,state,reason,amount) VALUES(_message,mid.phone,r.id,r.order_id,_path,_hash,nullif(_evidence->>'transactionId',''),_evidence,final_state,_reason,total) RETURNING id INTO rid;
 INSERT INTO public.payment_receipt_events(receipt_id,action,reason) VALUES(rid,CASE WHEN final_state='unverified' THEN 'Baixa automática por comprovante' ELSE 'Comprovante precisa de conferência' END,_reason);
 IF final_state='unverified' AND o IS NOT NULL THEN
 receipt_payment=jsonb_build_object('method','Pix','amount',total,'receiptId',rid,'origin','Baixa automática por comprovante','verification','unverified');
 UPDATE public.pdv_state SET data=jsonb_set(s,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=r.order_id THEN value||jsonb_build_object('payments',jsonb_build_array(receipt_payment),'paidAt',floor(extract(epoch FROM now())*1000),'paymentStatus','pago') ELSE value END) FROM jsonb_array_elements(s->'orders'))),revision=revision+1,updated_at=now() WHERE id=1;
 END IF;
 UPDATE public.whatsapp_conversations SET attendance_status='needs_reply',awaiting_since=now() WHERE phone=mid.phone;
 RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.record_payment_receipt(uuid,text,text,jsonb,uuid,boolean,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.record_payment_receipt(uuid,text,text,jsonb,uuid,boolean,text) TO service_role;
CREATE OR REPLACE FUNCTION public.review_payment_receipt(_id uuid,_confirm boolean,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.payment_receipts; req public.whatsapp_order_requests; s jsonb; o jsonb; ps jsonb; name text;
BEGIN
 IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF NOT _confirm AND length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Informe o motivo da correção'; END IF;
 PERFORM pg_advisory_xact_lock(742019); SELECT * INTO r FROM public.payment_receipts WHERE id=_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Comprovante não encontrado'; END IF;
 IF (_confirm AND r.state='confirmed') OR (NOT _confirm AND r.state='corrected') THEN RETURN; END IF;
 SELECT * INTO req FROM public.whatsapp_order_requests WHERE id=r.request_id;
 SELECT data INTO s FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO o FROM jsonb_array_elements(s->'orders') WHERE value->>'id'=coalesce(r.order_id,req.order_id);
 IF _confirm AND o IS NULL THEN RAISE EXCEPTION 'Vincule e aceite o pedido antes de confirmar a baixa'; END IF;
 IF _confirm AND o->>'status'='cancelado' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(o->'payments','[]')) p WHERE p->>'receiptId'=r.id::text) THEN RAISE EXCEPTION 'Pedido cancelado: resolver recebimento ou reembolso, sem reativar'; END IF;
 SELECT coalesce(jsonb_agg(CASE WHEN p->>'receiptId'=r.id::text THEN p||jsonb_build_object('verification','confirmed') ELSE p END),'[]') INTO ps FROM jsonb_array_elements(coalesce(o->'payments','[]')) p WHERE _confirm OR p->>'receiptId' IS DISTINCT FROM r.id::text;
 IF _confirm AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ps) p WHERE p->>'receiptId'=r.id::text) THEN
 IF jsonb_array_length(ps)>0 THEN RAISE EXCEPTION 'Pedido já possui pagamento: não registrar novamente'; END IF;
 ps=jsonb_build_array(jsonb_build_object('method','Pix','amount',r.amount,'receiptId',r.id,'origin','Conferência manual de comprovante','verification','confirmed'));
 END IF;
 IF o IS NOT NULL THEN UPDATE public.pdv_state SET data=jsonb_set(s,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=o->>'id' THEN value||jsonb_build_object('payments',ps,'paymentStatus',CASE WHEN _confirm THEN 'pago' ELSE 'pendente' END,'paidAt',CASE WHEN _confirm THEN coalesce(value->'paidAt',to_jsonb(floor(extract(epoch FROM now())*1000))) ELSE 'null'::jsonb END) ELSE value END) FROM jsonb_array_elements(s->'orders'))),revision=revision+1,updated_at=now() WHERE id=1; END IF;
 SELECT display_name INTO name FROM public.profiles WHERE id=auth.uid();
 UPDATE public.payment_receipts SET state=CASE WHEN _confirm THEN 'confirmed' ELSE 'corrected' END,reviewed_at=now(),reviewed_by=auth.uid(),order_id=coalesce(r.order_id,req.order_id) WHERE id=r.id;
 INSERT INTO public.payment_receipt_events(receipt_id,action,reason,actor,actor_name) VALUES(r.id,CASE WHEN _confirm THEN 'Recebimento confirmado pela equipe' ELSE 'Baixa corrigida' END,coalesce(_reason,''),auth.uid(),coalesce(name,'Atendente'));
END $$;
REVOKE ALL ON FUNCTION public.review_payment_receipt(uuid,boolean,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.review_payment_receipt(uuid,boolean,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.close_pdv_order(_id text,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb; o jsonb; products jsonb; item jsonb; name text;
BEGIN
 IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;
 PERFORM pg_advisory_xact_lock(742019); SELECT data INTO s FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO o FROM jsonb_array_elements(s->'orders') WHERE value->>'id'=_id;
 IF o IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF; IF o->>'status'='cancelado' THEN RETURN; END IF;
 products=s->'products';
 FOR item IN SELECT value FROM jsonb_array_elements(o->'items') LOOP
 SELECT jsonb_agg(CASE WHEN p->>'id'=item->>'productId' AND p->>'stock' IS NOT NULL THEN jsonb_set(p,'{stock}',to_jsonb((p->>'stock')::numeric+(item->>'qty')::numeric)) ELSE p END) INTO products FROM jsonb_array_elements(products) p;
 END LOOP;
 SELECT display_name INTO name FROM public.profiles WHERE id=auth.uid();
 UPDATE public.pdv_state SET data=jsonb_set(jsonb_set(s,'{products}',products),'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=_id THEN value||jsonb_build_object('status','cancelado','closedReason',trim(_reason),'closedAt',floor(extract(epoch FROM now())*1000),'closedBy',auth.uid(),'closedByName',name,'paymentResolutionRequired',jsonb_array_length(coalesce(value->'payments','[]'))>0) ELSE value END) FROM jsonb_array_elements(s->'orders'))),revision=revision+1,updated_at=now() WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION public.close_pdv_order(text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.close_pdv_order(text,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.close_whatsapp_request(_id uuid,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.whatsapp_order_requests; name text;
BEGIN
 IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Informe o motivo da recusa'; END IF;
 PERFORM pg_advisory_xact_lock(742019); SELECT * INTO r FROM public.whatsapp_order_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF; IF r.status IN ('rejected','cancelled') THEN RETURN; END IF;
 IF r.order_id IS NOT NULL THEN PERFORM public.close_pdv_order(r.order_id,_reason); ELSE
 SELECT display_name INTO name FROM public.profiles WHERE id=auth.uid();
 UPDATE public.whatsapp_order_requests SET status='rejected',closed_reason=trim(_reason),closed_at=now(),closed_by=auth.uid(),closed_by_name=name,updated_at=now() WHERE id=_id;
 UPDATE public.whatsapp_jobs SET state='cancelled',lease_until=NULL WHERE state IN ('pending','running') AND (payload->>'requestId'=_id::text OR (phone=r.phone AND kind='interpret'));
 UPDATE public.whatsapp_conversations SET draft='{}',draft_version=draft_version+1 WHERE phone=r.phone;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.close_whatsapp_request(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.close_whatsapp_request(uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guard_terminal_pdv_orders() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o jsonb; prev jsonb;
BEGIN
 FOR o IN SELECT value FROM jsonb_array_elements(NEW.data->'orders') LOOP
 SELECT value INTO prev FROM jsonb_array_elements(OLD.data->'orders') WHERE value->>'id'=o->>'id';
 IF prev->>'status'='cancelado' AND o->>'status'<>'cancelado' THEN RAISE EXCEPTION 'Pedido cancelado não pode ser reaberto'; END IF;
 IF o->>'status'='cancelado' AND prev->>'status' IS DISTINCT FROM 'cancelado' THEN
 UPDATE public.whatsapp_order_requests SET status='cancelled',closed_reason=coalesce(o->>'closedReason','Cancelado no PDV'),closed_at=now(),closed_by=auth.uid(),closed_by_name=o->>'closedByName',updated_at=now() WHERE order_id=o->>'id' AND status NOT IN ('rejected','cancelled');
 UPDATE public.whatsapp_jobs SET state='cancelled',lease_until=NULL WHERE state IN ('pending','running') AND (payload->>'orderId'=o->>'id' OR payload->>'requestId' IN (SELECT id::text FROM public.whatsapp_order_requests WHERE order_id=o->>'id'));
 END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.data->'orders') prev WHERE prev->>'status'='cancelado' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.data->'orders') o WHERE o->>'id'=prev->>'id')) THEN RAISE EXCEPTION 'Preserve o histórico dos pedidos cancelados'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pdv_terminal_guard BEFORE UPDATE ON public.pdv_state FOR EACH ROW EXECUTE FUNCTION public.guard_terminal_pdv_orders();
CREATE OR REPLACE FUNCTION public.receipt_after_order_acceptance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.payment_receipts; s jsonb;
BEGIN
 IF NEW.status='accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
 SELECT * INTO r FROM public.payment_receipts WHERE request_id=NEW.id AND state IN ('unverified','confirmed') ORDER BY received_at LIMIT 1;
 IF r.id IS NOT NULL THEN
 SELECT data INTO s FROM public.pdv_state WHERE id=1 FOR UPDATE;
 UPDATE public.pdv_state SET data=jsonb_set(s,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=NEW.order_id AND jsonb_array_length(coalesce(value->'payments','[]'))=0 THEN value||jsonb_build_object('paymentStatus','pago','paidAt',floor(extract(epoch FROM r.received_at)*1000),'payments',jsonb_build_array(jsonb_build_object('method','Pix','amount',r.amount,'receiptId',r.id,'origin','Baixa automática por comprovante','verification',CASE WHEN r.state='confirmed' THEN 'confirmed' ELSE 'unverified' END))) ELSE value END) FROM jsonb_array_elements(s->'orders'))),revision=revision+1,updated_at=now() WHERE id=1;
 UPDATE public.payment_receipts SET order_id=NEW.order_id WHERE id=r.id;
 END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER receipt_acceptance AFTER UPDATE ON public.whatsapp_order_requests FOR EACH ROW EXECUTE FUNCTION public.receipt_after_order_acceptance();