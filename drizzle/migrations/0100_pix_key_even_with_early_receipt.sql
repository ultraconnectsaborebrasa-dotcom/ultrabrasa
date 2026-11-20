CREATE OR REPLACE FUNCTION public.receipt_acceptance_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE b jsonb; payment text; text_value text;
BEGIN
 IF NEW.dedup_key LIKE 'accepted:%' AND NEW.dedup_key NOT LIKE '%:pix-key' THEN
 SELECT business INTO b FROM public.whatsapp_settings WHERE id=1;
 SELECT coalesce(
   nullif(trim(coalesce(r.request->'delivery'->>'paymentMethod','')),''),
   nullif(trim(coalesce(r.request->>'payment','')),''),
   CASE
     WHEN coalesce(r.request->>'note','') LIKE '%Pagamento: Pix%' THEN 'Pix'
     WHEN coalesce(r.request->>'note','') LIKE '%Pagamento: Dinheiro%' THEN 'Dinheiro'
     WHEN coalesce(r.request->>'note','') LIKE '%Pagamento: Cartão%' THEN 'Cartão'
   END
 ) INTO payment FROM public.whatsapp_order_requests r WHERE order_id=NEW.payload->>'orderId' LIMIT 1;
 text_value='Seu pedido está confirmado! 😊';
 IF payment='Pix' THEN
   text_value=text_value||' Pra adiantar, você já pode fazer o Pix de R$ '||(SELECT replace(to_char(quoted_total,'FM999999990.00'),'.',',') FROM public.whatsapp_order_requests WHERE order_id=NEW.payload->>'orderId' LIMIT 1)||'.';
   IF coalesce(b->>'pixKey','')<>'' THEN
     INSERT INTO public.whatsapp_jobs(dedup_key,phone,kind,payload,next_attempt_at)
     VALUES(NEW.dedup_key||':pix-key',NEW.phone,'text',jsonb_build_object('text','Para realizar o pagamento, segue nossa chave PIX:'||E'\n\n'||'Chave PIX telefone '||(b->>'pixKey')||E'\n\n'||'Após o pagamento, se possível, envie o comprovante por aqui para confirmarmos. ✅'||E'\n\n'||'Agradecemos pela preferência!'||E'\n\n'||'UltraConnect🔥','orderId',NEW.payload->>'orderId','automatic',false,'pixPrompt',true),now()+interval '1 second')
     ON CONFLICT(dedup_key) DO NOTHING;
   END IF;
 END IF;
 NEW.payload=NEW.payload||jsonb_build_object('text',text_value,'pixPrompt',payment='Pix');
 END IF;
 RETURN NEW;
END $function$;