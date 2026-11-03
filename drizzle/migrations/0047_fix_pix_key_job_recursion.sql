CREATE OR REPLACE FUNCTION public.receipt_acceptance_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE b jsonb; pending boolean; payment text; text_value text;
BEGIN
 IF NEW.dedup_key LIKE 'accepted:%' AND NEW.dedup_key NOT LIKE '%:pix-key' THEN
 SELECT business INTO b FROM public.whatsapp_settings WHERE id=1;
 SELECT coalesce(r.request->'delivery'->>'paymentMethod',r.request->>'payment') INTO payment FROM public.whatsapp_order_requests r WHERE order_id=NEW.payload->>'orderId' LIMIT 1;
 SELECT EXISTS(SELECT 1 FROM public.payment_receipts WHERE order_id=NEW.payload->>'orderId' AND state IN ('review','unverified','confirmed')) INTO pending;
 text_value='Seu pedido está confirmado! 😊';
 IF payment='Pix' AND NOT pending THEN
 text_value=text_value||' Pra adiantar, você já pode fazer o Pix de R$ '||(SELECT replace(to_char(quoted_total,'FM999999990.00'),'.',',') FROM public.whatsapp_order_requests WHERE order_id=NEW.payload->>'orderId' LIMIT 1)||'. Vou deixar a chave aqui pra você. Depois, é só mandar o comprovante.';
 IF coalesce(b->>'pixKey','')<>'' THEN
 INSERT INTO public.whatsapp_jobs(dedup_key,phone,kind,payload,next_attempt_at) VALUES(NEW.dedup_key||':pix-key',NEW.phone,'text',jsonb_build_object('text',b->>'pixKey','orderId',NEW.payload->>'orderId','automatic',false,'pixPrompt',true),now()+interval '1 second') ON CONFLICT(dedup_key) DO NOTHING;
 END IF;
 END IF;
 NEW.payload=NEW.payload||jsonb_build_object('text',text_value,'pixPrompt',payment='Pix' AND NOT pending);
 END IF;
 RETURN NEW;
END $function$;