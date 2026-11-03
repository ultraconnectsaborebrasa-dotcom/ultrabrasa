DO $do$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.record_payment_receipt'::regproc);
 d:=regexp_replace(d,'IF final_state=''unverified'' AND o IS NOT NULL THEN.*?END IF;\s*UPDATE public.whatsapp_conversations','UPDATE public.whatsapp_conversations','s');
 d:=replace(d,'''Baixa automática por comprovante'' ELSE','''Comprovante recebido — aguardando conferência'' ELSE');
 IF d LIKE '%receipt_payment=jsonb_build_object%' THEN RAISE EXCEPTION 'patch failed record'; END IF;
 EXECUTE d;
 d:=pg_get_functiondef('public.mark_receipt_received'::regproc);
 d:=regexp_replace(d,'UPDATE public.pdv_state SET data=jsonb_set\(s,''\{orders\}''.*?WHERE id=1;','','s');
 IF d LIKE '%UPDATE public.pdv_state%' THEN RAISE EXCEPTION 'patch failed mark'; END IF;
 EXECUTE d;
END $do$;
CREATE OR REPLACE FUNCTION public.receipt_after_order_acceptance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF NEW.status='accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
  UPDATE public.payment_receipts SET order_id=NEW.order_id WHERE request_id=NEW.id AND order_id IS NULL AND state IN ('unverified','review');
 END IF; RETURN NEW;
END $function$;