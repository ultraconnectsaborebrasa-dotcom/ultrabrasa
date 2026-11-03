CREATE OR REPLACE FUNCTION public.guard_receipt_double_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o jsonb; prev jsonb;
BEGIN
FOR o IN SELECT value FROM jsonb_array_elements(NEW.data->'orders') LOOP
SELECT value INTO prev FROM jsonb_array_elements(OLD.data->'orders') WHERE value->>'id'=o->>'id';
IF o->'payments' IS DISTINCT FROM prev->'payments' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(o->'payments','[]')) p WHERE p->>'receiptId' IS NULL) AND (EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(prev->'payments','[]')) p WHERE p->>'receiptId' IS NOT NULL) OR EXISTS(SELECT 1 FROM public.payment_receipts r JOIN public.whatsapp_order_requests q ON q.id=r.request_id WHERE coalesce(r.order_id,q.order_id)=o->>'id' AND r.state='review')) THEN RAISE EXCEPTION 'Comprovante em conferência: use a revisão, sem cobrar novamente'; END IF;
END LOOP;RETURN NEW;END $$;