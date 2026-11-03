ALTER TABLE public.whatsapp_jobs DROP CONSTRAINT whatsapp_jobs_kind_check;
ALTER TABLE public.whatsapp_jobs ADD CONSTRAINT whatsapp_jobs_kind_check CHECK(kind IN ('interpret','text','document','receipt'));
CREATE OR REPLACE FUNCTION public.receipt_acceptance_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b jsonb; pending boolean; payment text; text_value text;
BEGIN
 IF NEW.dedup_key LIKE 'accepted:%' THEN
 SELECT business INTO b FROM public.whatsapp_settings WHERE id=1;
 SELECT coalesce(r.request->'delivery'->>'paymentMethod',r.request->>'payment') INTO payment FROM public.whatsapp_order_requests r WHERE order_id=NEW.payload->>'orderId';
 SELECT EXISTS(SELECT 1 FROM public.payment_receipts WHERE order_id=NEW.payload->>'orderId' AND state IN ('review','unverified','confirmed')) INTO pending;
 text_value='Seu pedido está confirmado! 😊';
 IF payment='Pix' AND NOT pending THEN
 text_value=text_value||' Pra adiantar, você já pode fazer o Pix de R$ '||(SELECT replace(to_char(quoted_total,'FM999999990.00'),'.',',') FROM public.whatsapp_order_requests WHERE order_id=NEW.payload->>'orderId')||'. Vou deixar a chave aqui pra você. Depois, é só mandar o comprovante.';
 INSERT INTO public.whatsapp_jobs(dedup_key,phone,kind,payload,next_attempt_at) VALUES(NEW.dedup_key||':pix-key',NEW.phone,'text',jsonb_build_object('text',b->>'pixKey','orderId',NEW.payload->>'orderId','automatic',false,'pixPrompt',true),now()+interval '1 second') ON CONFLICT(dedup_key) DO NOTHING;
 END IF;
 NEW.payload=NEW.payload||jsonb_build_object('text',text_value,'pixPrompt',payment='Pix' AND NOT pending);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER acceptance_message BEFORE INSERT ON public.whatsapp_jobs FOR EACH ROW EXECUTE FUNCTION public.receipt_acceptance_message();
CREATE OR REPLACE FUNCTION public.cancel_pdv_cashier_order(order_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.close_pdv_order(order_id,'Cancelado pela equipe no Caixa'); END $$;
CREATE OR REPLACE FUNCTION public.wa_reject_request(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.close_whatsapp_request(_id,'Recusado pela equipe'); END $$;
CREATE OR REPLACE FUNCTION public.link_payment_receipt(_id uuid,_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.payment_receipts; req public.whatsapp_order_requests; name text;
BEGIN IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
PERFORM pg_advisory_xact_lock(742019); SELECT * INTO r FROM public.payment_receipts WHERE id=_id FOR UPDATE;
SELECT * INTO req FROM public.whatsapp_order_requests WHERE id=_request AND phone=r.phone;
IF r.state<>'review' OR req.id IS NULL THEN RAISE EXCEPTION 'Vínculo inválido'; END IF;
UPDATE public.payment_receipts SET request_id=req.id,order_id=req.order_id,amount=req.quoted_total WHERE id=r.id;
SELECT display_name INTO name FROM public.profiles WHERE id=auth.uid();
INSERT INTO public.payment_receipt_events(receipt_id,action,reason,actor,actor_name) VALUES(r.id,'Comprovante vinculado ao pedido',req.id::text,auth.uid(),coalesce(name,'Atendente'));
END $$;
REVOKE ALL ON FUNCTION public.link_payment_receipt(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.link_payment_receipt(uuid,uuid) TO authenticated,service_role;