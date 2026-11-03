ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS departed_at timestamptz;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS assigned_courier_id uuid REFERENCES public.delivery_couriers(id);
CREATE POLICY receipts_staff_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='payment-receipts' AND public.wa_staff() AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE OR REPLACE FUNCTION public.mark_receipt_received(_id uuid, _order text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.payment_receipts; s jsonb; o jsonb; req public.whatsapp_order_requests; total numeric; actor_name_value text;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
PERFORM pg_advisory_xact_lock(742019);
SELECT * INTO r FROM public.payment_receipts WHERE id=_id FOR UPDATE;
IF r.id IS NULL OR r.storage_path IS NULL THEN RAISE EXCEPTION 'Anexe o arquivo antes de registrar'; END IF;
SELECT data INTO s FROM public.pdv_state WHERE id=1 FOR UPDATE;
SELECT value INTO o FROM jsonb_array_elements(s->'orders') WHERE value->>'id'=_order;
IF o IS NULL OR o->>'status'='cancelado' THEN RAISE EXCEPTION 'Pedido inexistente ou cancelado: verificar com o caixa'; END IF;
IF public.normalize_phone(o->>'customerPhone') IS DISTINCT FROM public.normalize_phone(r.phone) THEN RAISE EXCEPTION 'Arquivo e pedido pertencem a clientes diferentes'; END IF;
IF r.order_id IS NOT NULL AND r.order_id<>_order THEN RAISE EXCEPTION 'Comprovante já vinculado a outro pedido'; END IF;
IF r.state IN ('unverified','confirmed') THEN RETURN; END IF;
IF EXISTS(SELECT 1 FROM public.payment_receipts x WHERE x.id<>r.id AND ((r.file_hash IS NOT NULL AND x.file_hash=r.file_hash) OR (r.transaction_id IS NOT NULL AND x.transaction_id=r.transaction_id))) THEN RAISE EXCEPTION 'Comprovante já registrado: verificar reutilização'; END IF;
IF jsonb_array_length(coalesce(o->'payments','[]'))>0 THEN RAISE EXCEPTION 'Pedido já possui pagamento'; END IF;
SELECT * INTO req FROM public.whatsapp_order_requests WHERE order_id=_order;
IF req.status IN ('cancelled','rejected') THEN RAISE EXCEPTION 'Pedido recusado/cancelado'; END IF;
total=greatest(0,coalesce((SELECT sum((i->>'price')::numeric*(i->>'qty')::numeric) FROM jsonb_array_elements(o->'items') i),0)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,0));
UPDATE public.payment_receipts SET order_id=_order,request_id=coalesce(req.id,r.request_id),state='unverified',amount=total,reason='Comprovante recebido; pagamento ainda não conferido',reviewed_at=NULL,reviewed_by=NULL WHERE id=r.id;
UPDATE public.pdv_state SET data=jsonb_set(s,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=_order THEN value||jsonb_build_object('paymentStatus','pago','paidAt',floor(extract(epoch FROM now())*1000),'payments',jsonb_build_array(jsonb_build_object('method','Pix','amount',total,'receiptId',r.id,'verification','unverified','origin','Comprovante recebido — conferir'))) ELSE value END) FROM jsonb_array_elements(s->'orders'))),revision=revision+1,updated_at=now() WHERE id=1;
SELECT display_name INTO actor_name_value FROM public.profiles WHERE id=auth.uid();
INSERT INTO public.payment_receipt_events(receipt_id,action,reason,actor,actor_name) VALUES(r.id,'Comprovante recebido',CASE WHEN auth.role()='service_role' THEN 'Reconhecimento automático; sem confirmação bancária' ELSE 'Registro manual; sem confirmação bancária' END,auth.uid(),coalesce(actor_name_value,'Automação'));
END $$;
CREATE OR REPLACE FUNCTION public.register_staff_receipt(_message uuid, _path text, _order text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mid public.whatsapp_messages; s jsonb; o jsonb; rid uuid; p text; actor_name_value text;
BEGIN
IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
PERFORM pg_advisory_xact_lock(742019);
SELECT data INTO s FROM public.pdv_state WHERE id=1 FOR UPDATE;
SELECT value INTO o FROM jsonb_array_elements(s->'orders') WHERE value->>'id'=_order;
IF o IS NULL OR o->>'status'='cancelado' THEN RAISE EXCEPTION 'Pedido inexistente ou cancelado'; END IF;
IF _message IS NOT NULL THEN
 SELECT * INTO mid FROM public.whatsapp_messages WHERE id=_message AND direction='in' AND kind IN ('image','document');
 IF mid.id IS NULL THEN RAISE EXCEPTION 'Selecione uma imagem ou PDF recebido'; END IF;
 SELECT id,storage_path INTO rid,p FROM public.payment_receipts WHERE message_id=mid.id;
 IF rid IS NULL OR p IS NULL THEN RAISE EXCEPTION 'Arquivo ainda não baixado; tente analisar novamente ou anexe o comprovante'; END IF;
ELSE
 IF _path IS NULL OR split_part(_path,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='payment-receipts' AND name=_path) THEN RAISE EXCEPTION 'Anexo inválido'; END IF;
 INSERT INTO public.whatsapp_messages(phone,direction,source,kind,body,status,sent_by,sent_by_name) SELECT public.normalize_phone(o->>'customerPhone'),'in','pdv','document','Comprovante anexado pela equipe','received',auth.uid(),display_name FROM public.profiles WHERE id=auth.uid() RETURNING * INTO mid;
 INSERT INTO public.payment_receipts(message_id,phone,storage_path,state,reason,evidence,amount) VALUES(mid.id,mid.phone,_path,'review','Anexado manualmente','{}',0) RETURNING id INTO rid;
END IF;
PERFORM public.mark_receipt_received(rid,_order);
RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION public.depart_delivery(_order text, _courier uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.delivery_orders; o jsonb;
BEGIN
IF NOT public.delivery_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
PERFORM pg_advisory_xact_lock(742021);
SELECT * INTO d FROM public.delivery_orders WHERE order_id=_order FOR UPDATE;
SELECT value INTO o FROM public.pdv_state s, jsonb_array_elements(s.data->'orders') WHERE s.id=1 AND value->>'id'=_order;
IF d.id IS NULL OR d.status IN ('Entregue','Cancelado') OR o->>'status'='cancelado' THEN RAISE EXCEPTION 'Entrega encerrada ou inexistente'; END IF;
IF o->>'status' NOT IN ('cozinha','pronto','pago') THEN RAISE EXCEPTION 'Aceite o pedido antes da saída'; END IF;
IF d.status='Em rota' THEN RETURN; END IF;
IF _courier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=_courier AND active) THEN RAISE EXCEPTION 'Entregador inválido'; END IF;
UPDATE public.delivery_orders SET status='Em rota',departed_at=coalesce(departed_at,now()),assigned_courier_id=_courier WHERE id=d.id;
END $$;
CREATE OR REPLACE FUNCTION public.wa_delivery_departure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NEW.status='Em rota' AND OLD.status IS DISTINCT FROM NEW.status THEN
 NEW.departed_at=coalesce(NEW.departed_at,now());
 IF EXISTS(SELECT 1 FROM public.whatsapp_conversations WHERE phone=public.normalize_phone(NEW.phone)) THEN
 INSERT INTO public.whatsapp_jobs(dedup_key,phone,kind,payload) VALUES('departed:'||NEW.order_id,public.normalize_phone(NEW.phone),'text',jsonb_build_object('text','Seu pedido saiu para entrega! 🛵 Já já chega por aí 😊','orderId',NEW.order_id,'automatic',false)) ON CONFLICT(dedup_key) DO NOTHING;
 END IF;
END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wa_departure ON public.delivery_orders;
CREATE TRIGGER delivery_departure_details BEFORE UPDATE OF status ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION public.wa_delivery_departure();
DO $$ DECLARE def text; BEGIN
SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='read_delivery_board';
def=replace(def,'''courier_id'',r.courier_id','''courier_id'',coalesce(d.assigned_courier_id,r.courier_id),''order_status'',o->>''status'',''payment_status'',CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(o->''payments'',''[]'')) p WHERE p->>''verification''=''unverified'') THEN ''Pago — conferir comprovante'' WHEN jsonb_array_length(coalesce(o->''payments'',''[]''))>0 THEN ''Pago'' ELSE ''Pendente'' END');
EXECUTE def;
END $$;
REVOKE ALL ON FUNCTION public.mark_receipt_received(uuid,text),public.register_staff_receipt(uuid,text,text),public.depart_delivery(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_receipt_received(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_staff_receipt(uuid,text,text),public.depart_delivery(text,uuid) TO authenticated;
