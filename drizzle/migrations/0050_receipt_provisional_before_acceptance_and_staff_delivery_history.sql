CREATE OR REPLACE FUNCTION public.mark_receipt_for_request(_id uuid, _request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.payment_receipts; q public.whatsapp_order_requests;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
PERFORM pg_advisory_xact_lock(742019);
SELECT * INTO r FROM public.payment_receipts WHERE id=_id FOR UPDATE;
SELECT * INTO q FROM public.whatsapp_order_requests WHERE id=_request AND phone=r.phone FOR UPDATE;
IF r.id IS NULL OR r.storage_path IS NULL OR q.id IS NULL OR q.status NOT IN ('awaiting_acceptance','accepted') THEN RAISE EXCEPTION 'Arquivo ou pedido inválido'; END IF;
IF r.state IN ('unverified','confirmed') THEN RETURN; END IF;
IF r.evidence->>'isPixReceipt' IS DISTINCT FROM 'true' OR r.evidence->>'state' NOT IN ('completed','unknown') THEN RAISE EXCEPTION 'Arquivo precisa de verificação manual'; END IF;
IF EXISTS(SELECT 1 FROM public.payment_receipts x WHERE x.id<>r.id AND ((r.file_hash IS NOT NULL AND x.file_hash=r.file_hash) OR (r.transaction_id IS NOT NULL AND x.transaction_id=r.transaction_id))) THEN RAISE EXCEPTION 'Comprovante já registrado'; END IF;
IF q.order_id IS NOT NULL THEN PERFORM public.mark_receipt_received(r.id,q.order_id); RETURN; END IF;
UPDATE public.payment_receipts SET request_id=q.id,amount=q.quoted_total,state='unverified',reason='Comprovante recebido; pagamento ainda não conferido' WHERE id=r.id;
INSERT INTO public.payment_receipt_events(receipt_id,action,reason,actor,actor_name) VALUES(r.id,'Comprovante recebido','Vinculado ao pedido aguardando aceite; sem confirmação bancária',auth.uid(),'Automação');
END $$;
REVOKE ALL ON FUNCTION public.mark_receipt_for_request(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_receipt_for_request(uuid,uuid) TO authenticated,service_role;
DO $$ DECLARE def text; BEGIN
SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='read_delivery_board';
def=replace(def,'(public.delivery_staff() AND d.status NOT IN (''Entregue'',''Cancelado''))','public.delivery_staff()');
EXECUTE def;
END $$;