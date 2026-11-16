ALTER TABLE public.whatsapp_conversations
  ADD COLUMN automation_pause_reason text CHECK (automation_pause_reason IN ('human','order_confirmed')),
  ADD COLUMN order_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION public.wa_touch_inbound(_phone text,_body text,_name text,_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
INSERT INTO public.whatsapp_conversations(phone,name,last_message,last_message_at,unread,last_inbound_at,attendance_status,awaiting_since) VALUES(_phone,_name,left(_body,200),_at,1,_at,'new',now()) ON CONFLICT(phone) DO UPDATE SET name=coalesce(EXCLUDED.name,whatsapp_conversations.name),last_message=CASE WHEN EXCLUDED.last_message_at>=whatsapp_conversations.last_message_at THEN EXCLUDED.last_message ELSE whatsapp_conversations.last_message END,last_message_at=greatest(EXCLUDED.last_message_at,whatsapp_conversations.last_message_at),unread=whatsapp_conversations.unread+1,last_inbound_at=greatest(EXCLUDED.last_inbound_at,whatsapp_conversations.last_inbound_at),
attendance_status=CASE WHEN whatsapp_conversations.attendance_status IN ('new','finished') OR whatsapp_conversations.assigned_to IS NULL THEN 'new' ELSE 'needs_reply' END,
assigned_to=CASE WHEN whatsapp_conversations.attendance_status='finished' THEN NULL ELSE whatsapp_conversations.assigned_to END,
assigned_name=CASE WHEN whatsapp_conversations.attendance_status='finished' THEN NULL ELSE whatsapp_conversations.assigned_name END,
automation_paused=CASE WHEN whatsapp_conversations.attendance_status='finished' AND whatsapp_conversations.automation_pause_reason IS DISTINCT FROM 'order_confirmed' THEN false ELSE whatsapp_conversations.automation_paused END,
awaiting_since=coalesce(whatsapp_conversations.awaiting_since,now()); END $$;

CREATE OR REPLACE FUNCTION public.wa_conversation_action(_phone text, _action text, _body text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.whatsapp_conversations; actor text; target uuid; target_name text; is_admin boolean; BEGIN
IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
is_admin=public.has_role(auth.uid(),'admin');
SELECT * INTO c FROM public.whatsapp_conversations WHERE phone=_phone FOR UPDATE; IF c.phone IS NULL THEN RAISE EXCEPTION 'Conversa não encontrada'; END IF;
SELECT display_name INTO actor FROM public.profiles WHERE id=auth.uid();
IF _action IN ('take','resume','waiting','finish','transfer') AND c.assigned_to IS NOT NULL AND c.assigned_to<>auth.uid() AND NOT is_admin THEN RAISE EXCEPTION 'Esta conversa já tem responsável: %', coalesce(c.assigned_name,'outro atendente'); END IF;
IF _action='take' THEN UPDATE public.whatsapp_conversations SET assigned_to=auth.uid(),assigned_name=actor,automation_paused=true,automation_pause_reason='human',order_confirmed_at=NULL,attendance_status='in_service' WHERE phone=_phone;
UPDATE public.whatsapp_jobs SET state='cancelled' WHERE phone=_phone AND state='pending' AND coalesce(payload->>'automatic','false')='true';
ELSIF _action='transfer' THEN
 BEGIN target=_body::uuid; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Atendente inválido'; END;
 IF NOT (public.has_role(target,'admin') OR public.has_role(target,'cashier')) THEN RAISE EXCEPTION 'Escolha um atendente com acesso ao WhatsApp'; END IF;
 SELECT display_name INTO target_name FROM public.profiles WHERE id=target;
 UPDATE public.whatsapp_conversations SET assigned_to=target,assigned_name=target_name,automation_paused=true,automation_pause_reason='human',order_confirmed_at=NULL,attendance_status='in_service' WHERE phone=_phone;
 UPDATE public.whatsapp_jobs SET state='cancelled' WHERE phone=_phone AND state='pending' AND coalesce(payload->>'automatic','false')='true';
 INSERT INTO public.whatsapp_notes(phone,body,author_id,author_name) VALUES(_phone,'Transferido para '||coalesce(target_name,'atendente'),auth.uid(),actor);
ELSIF _action='resume' THEN UPDATE public.whatsapp_conversations SET automation_paused=false,automation_pause_reason=NULL,order_confirmed_at=NULL,assigned_to=NULL,assigned_name=NULL,attendance_status='needs_reply' WHERE phone=_phone;
ELSIF _action='read' THEN UPDATE public.whatsapp_conversations SET unread=0,last_read_at=now() WHERE phone=_phone;
ELSIF _action='waiting' THEN UPDATE public.whatsapp_conversations SET attendance_status='waiting_customer',awaiting_since=NULL WHERE phone=_phone;
ELSIF _action='finish' THEN IF EXISTS(SELECT 1 FROM public.whatsapp_order_requests WHERE phone=_phone AND status='awaiting_acceptance') THEN RAISE EXCEPTION 'Existe pedido aguardando aceite'; END IF; UPDATE public.whatsapp_conversations SET attendance_status='finished',automation_paused=true,awaiting_since=NULL WHERE phone=_phone;
ELSIF _action='note' THEN IF length(trim(coalesce(_body,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Nota inválida'; END IF; INSERT INTO public.whatsapp_notes(phone,body,author_id,author_name) VALUES(_phone,trim(_body),auth.uid(),actor);
ELSE RAISE EXCEPTION 'Ação inválida'; END IF; END $$;

DO $$ DECLARE src text; target text; replacement text; BEGIN
 SELECT pg_get_functiondef('public.wa_confirm_request(text,text,integer,jsonb,numeric)'::regprocedure) INTO src;
 target='UPDATE public.whatsapp_conversations SET automation_paused=true,attendance_status=''needs_reply'',draft_version=draft_version+1 WHERE phone=_phone;';
 replacement='UPDATE public.whatsapp_conversations SET automation_paused=true,automation_pause_reason=''order_confirmed'',order_confirmed_at=now(),attendance_status=''needs_reply'',draft_version=draft_version+1 WHERE phone=_phone;';
 IF position(target IN src)=0 THEN RAISE EXCEPTION 'confirm pause insertion point missing'; END IF;
 EXECUTE replace(src,target,replacement);

 SELECT pg_get_functiondef('public.wa_accept_request(uuid)'::regprocedure) INTO src;
 target='UPDATE public.whatsapp_conversations SET automation_paused=true,assigned_to=auth.uid(),attendance_status=''in_service'',draft=''{}'',draft_version=draft_version+1 WHERE phone=r.phone;';
 replacement='UPDATE public.whatsapp_conversations SET automation_paused=true,automation_pause_reason=''order_confirmed'',order_confirmed_at=coalesce(order_confirmed_at,now()),assigned_to=auth.uid(),attendance_status=''in_service'',draft=''{}'',draft_version=draft_version+1 WHERE phone=r.phone;';
 IF position(target IN src)=0 THEN RAISE EXCEPTION 'accept pause insertion point missing'; END IF;
 EXECUTE replace(src,target,replacement);

 SELECT pg_get_functiondef('public.catalog_place_order(uuid,jsonb)'::regprocedure) INTO src;
 target='UPDATE public.whatsapp_conversations SET automation_paused=true,attendance_status=CASE WHEN attendance_status=''in_service'' THEN attendance_status ELSE ''new'' END,draft=''{}'',draft_version=draft_version+1 WHERE whatsapp_conversations.phone=v_phone;';
 replacement='UPDATE public.whatsapp_conversations SET automation_paused=true,automation_pause_reason=''order_confirmed'',order_confirmed_at=now(),attendance_status=CASE WHEN attendance_status=''in_service'' THEN attendance_status ELSE ''new'' END,draft=''{}'',draft_version=draft_version+1 WHERE whatsapp_conversations.phone=v_phone;';
 IF position(target IN src)=0 THEN RAISE EXCEPTION 'catalog pause insertion point missing'; END IF;
 EXECUTE replace(src,target,replacement);

 SELECT pg_get_functiondef('public.close_whatsapp_request(uuid,text)'::regprocedure) INTO src;
 target='UPDATE public.whatsapp_conversations SET draft=''{}'',draft_version=draft_version+1 WHERE phone=r.phone;';
 replacement='UPDATE public.whatsapp_conversations SET draft=''{}'',draft_version=draft_version+1,automation_pause_reason=NULL,order_confirmed_at=NULL WHERE phone=r.phone;';
 IF position(target IN src)=0 THEN RAISE EXCEPTION 'reject pause insertion point missing'; END IF;
 EXECUTE replace(src,target,replacement);
END $$;