CREATE OR REPLACE FUNCTION public.wa_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier') $$;
REVOKE ALL ON FUNCTION public.wa_staff() FROM public, anon; GRANT EXECUTE ON FUNCTION public.wa_staff() TO authenticated;

ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS sent_by_name text;

CREATE POLICY "cashier read wa conv" ON public.whatsapp_conversations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'cashier'));
CREATE POLICY "cashier read wa msg" ON public.whatsapp_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'cashier'));
CREATE POLICY "cashier read wa notes" ON public.whatsapp_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'cashier'));
CREATE POLICY "cashier read wa requests" ON public.whatsapp_order_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'cashier'));
CREATE POLICY "cashier read wa jobs" ON public.whatsapp_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'cashier'));
CREATE POLICY "cashier read wa settings" ON public.whatsapp_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'cashier'));

CREATE OR REPLACE FUNCTION public.wa_conversation_action(_phone text, _action text, _body text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE c public.whatsapp_conversations; actor text; target uuid; target_name text; is_admin boolean; BEGIN
IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
is_admin=public.has_role(auth.uid(),'admin');
SELECT * INTO c FROM public.whatsapp_conversations WHERE phone=_phone FOR UPDATE; IF c.phone IS NULL THEN RAISE EXCEPTION 'Conversa não encontrada'; END IF;
SELECT display_name INTO actor FROM public.profiles WHERE id=auth.uid();
IF _action IN ('take','resume','waiting','finish','transfer') AND c.assigned_to IS NOT NULL AND c.assigned_to<>auth.uid() AND NOT is_admin THEN RAISE EXCEPTION 'Esta conversa já tem responsável: %', coalesce(c.assigned_name,'outro atendente'); END IF;
IF _action='take' THEN UPDATE public.whatsapp_conversations SET assigned_to=auth.uid(),assigned_name=actor,automation_paused=true,attendance_status='in_service' WHERE phone=_phone;
UPDATE public.whatsapp_jobs SET state='cancelled' WHERE phone=_phone AND state='pending' AND coalesce(payload->>'automatic','false')='true';
ELSIF _action='transfer' THEN
 BEGIN target=_body::uuid; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Atendente inválido'; END;
 IF NOT (public.has_role(target,'admin') OR public.has_role(target,'cashier')) THEN RAISE EXCEPTION 'Escolha um atendente com acesso ao WhatsApp'; END IF;
 SELECT display_name INTO target_name FROM public.profiles WHERE id=target;
 UPDATE public.whatsapp_conversations SET assigned_to=target,assigned_name=target_name,automation_paused=true,attendance_status='in_service' WHERE phone=_phone;
 UPDATE public.whatsapp_jobs SET state='cancelled' WHERE phone=_phone AND state='pending' AND coalesce(payload->>'automatic','false')='true';
 INSERT INTO public.whatsapp_notes(phone,body,author_id,author_name) VALUES(_phone,'Transferido para '||coalesce(target_name,'atendente'),auth.uid(),actor);
ELSIF _action='resume' THEN UPDATE public.whatsapp_conversations SET automation_paused=false,assigned_to=NULL,assigned_name=NULL,attendance_status='needs_reply' WHERE phone=_phone;
ELSIF _action='read' THEN UPDATE public.whatsapp_conversations SET unread=0,last_read_at=now() WHERE phone=_phone;
ELSIF _action='waiting' THEN UPDATE public.whatsapp_conversations SET attendance_status='waiting_customer',awaiting_since=NULL WHERE phone=_phone;
ELSIF _action='finish' THEN IF EXISTS(SELECT 1 FROM public.whatsapp_order_requests WHERE phone=_phone AND status='awaiting_acceptance') THEN RAISE EXCEPTION 'Existe pedido aguardando aceite'; END IF; UPDATE public.whatsapp_conversations SET attendance_status='finished',automation_paused=true,awaiting_since=NULL WHERE phone=_phone;
ELSIF _action='note' THEN IF length(trim(coalesce(_body,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Nota inválida'; END IF; INSERT INTO public.whatsapp_notes(phone,body,author_id,author_name) VALUES(_phone,trim(_body),auth.uid(),actor);
ELSE RAISE EXCEPTION 'Ação inválida'; END IF; END $function$;

CREATE OR REPLACE FUNCTION public.wa_staff_list() RETURNS TABLE(id uuid, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT DISTINCT p.id, p.display_name FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE r.role IN ('admin','cashier') AND public.wa_staff() ORDER BY 2 $$;
REVOKE ALL ON FUNCTION public.wa_staff_list() FROM public, anon; GRANT EXECUTE ON FUNCTION public.wa_staff_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.wa_reject_request(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF; UPDATE public.whatsapp_order_requests SET status='rejected',updated_at=now() WHERE id=_id AND status='awaiting_acceptance'; UPDATE public.whatsapp_conversations SET draft='{}',draft_version=draft_version+1 WHERE phone=(SELECT phone FROM public.whatsapp_order_requests WHERE id=_id); END $function$;

DO $$ DECLARE src text; BEGIN
 SELECT pg_get_functiondef('public.wa_accept_request(uuid)'::regprocedure) INTO src;
 src=replace(src,'IF NOT public.has_role(auth.uid(),''admin'') THEN RAISE EXCEPTION ''Sem permissão''; END IF;','IF NOT public.wa_staff() THEN RAISE EXCEPTION ''Sem permissão''; END IF;');
 IF position('wa_staff()' in src)=0 THEN RAISE EXCEPTION 'accept patch failed'; END IF;
 EXECUTE src;
END $$;