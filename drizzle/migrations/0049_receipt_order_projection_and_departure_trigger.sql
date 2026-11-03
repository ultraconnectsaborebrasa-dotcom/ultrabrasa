DROP TRIGGER IF EXISTS wa_delivery_departure ON public.delivery_orders;
DO $$ DECLARE def text; BEGIN
SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='read_pdv_cashier';
IF position('''customerPhone''' IN def)=0 THEN def=replace(def,'''customer'',o->>''customer''','''customer'',o->>''customer'',''customerPhone'',o->>''customerPhone'''); EXECUTE def; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.link_payment_receipt(_id uuid, _request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.payment_receipts; req public.whatsapp_order_requests; actor_label text;
BEGIN
IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
PERFORM pg_advisory_xact_lock(742019);
SELECT * INTO r FROM public.payment_receipts WHERE id=_id FOR UPDATE;
SELECT * INTO req FROM public.whatsapp_order_requests WHERE id=_request AND phone=r.phone;
IF r.state<>'review' OR req.id IS NULL OR req.status IN ('rejected','cancelled') THEN RAISE EXCEPTION 'Vínculo inválido ou pedido encerrado'; END IF;
UPDATE public.payment_receipts SET request_id=req.id,order_id=req.order_id,amount=req.quoted_total WHERE id=r.id;
SELECT display_name INTO actor_label FROM public.profiles WHERE id=auth.uid();
INSERT INTO public.payment_receipt_events(receipt_id,action,reason,actor,actor_name) VALUES(r.id,'Comprovante vinculado ao pedido',req.id::text,auth.uid(),coalesce(actor_label,'Atendente'));
IF req.order_id IS NOT NULL AND r.storage_path IS NOT NULL AND r.evidence->>'isPixReceipt'='true' AND r.evidence->>'state' IN ('completed','unknown') THEN PERFORM public.mark_receipt_received(r.id,req.order_id); END IF;
END $$;