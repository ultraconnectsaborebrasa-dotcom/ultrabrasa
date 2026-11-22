CREATE OR REPLACE FUNCTION public.wa_touch_inbound(_phone text, _body text, _name text, _at timestamp with time zone)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.whatsapp_conversations(
    phone,name,last_message,last_message_at,unread,last_inbound_at,
    attendance_status,awaiting_since,attendance_started_at
  ) VALUES(
    _phone,_name,left(_body,200),_at,1,_at,'new',now(),_at
  )
  ON CONFLICT(phone) DO UPDATE SET
    name=coalesce(EXCLUDED.name,whatsapp_conversations.name),
    last_message=CASE WHEN EXCLUDED.last_message_at>=whatsapp_conversations.last_message_at THEN EXCLUDED.last_message ELSE whatsapp_conversations.last_message END,
    last_message_at=greatest(EXCLUDED.last_message_at,whatsapp_conversations.last_message_at),
    unread=whatsapp_conversations.unread+1,
    last_inbound_at=greatest(EXCLUDED.last_inbound_at,whatsapp_conversations.last_inbound_at),
    attendance_started_at=CASE WHEN whatsapp_conversations.attendance_status='finished' OR whatsapp_conversations.attendance_started_at IS NULL THEN _at ELSE whatsapp_conversations.attendance_started_at END,
    attendance_status=CASE WHEN whatsapp_conversations.attendance_status IN ('new','finished') OR whatsapp_conversations.assigned_to IS NULL THEN 'new' ELSE 'needs_reply' END,
    assigned_to=CASE WHEN whatsapp_conversations.attendance_status='finished' THEN NULL ELSE whatsapp_conversations.assigned_to END,
    assigned_name=CASE WHEN whatsapp_conversations.attendance_status='finished' THEN NULL ELSE whatsapp_conversations.assigned_name END,
    automation_paused=CASE WHEN whatsapp_conversations.attendance_status='finished' THEN false ELSE whatsapp_conversations.automation_paused END,
    automation_pause_reason=CASE WHEN whatsapp_conversations.attendance_status='finished' THEN NULL ELSE whatsapp_conversations.automation_pause_reason END,
    order_confirmed_at=CASE WHEN whatsapp_conversations.attendance_status='finished' THEN NULL ELSE whatsapp_conversations.order_confirmed_at END,
    draft=CASE WHEN whatsapp_conversations.attendance_status='finished' THEN '{}'::jsonb ELSE whatsapp_conversations.draft END,
    draft_version=CASE WHEN whatsapp_conversations.attendance_status='finished' THEN whatsapp_conversations.draft_version+1 ELSE whatsapp_conversations.draft_version END,
    awaiting_since=CASE WHEN whatsapp_conversations.attendance_status='finished' THEN now() ELSE coalesce(whatsapp_conversations.awaiting_since,now()) END;
END $function$;