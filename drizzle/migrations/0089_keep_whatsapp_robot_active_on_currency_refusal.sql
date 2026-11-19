CREATE OR REPLACE FUNCTION public.prevent_whatsapp_currency_pause()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.business->>'circuitReason' = 'O WhatsApp recusou os envios porque a moeda da conta comercial não está configurada. Defina Real (BRL) no Gerenciador do WhatsApp e ative o robô novamente.' THEN
    NEW.business = jsonb_set(
      jsonb_set(coalesce(NEW.business, '{}'::jsonb), '{circuitPaused}', 'false'::jsonb, true),
      '{circuitReason}', '""'::jsonb, true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_whatsapp_currency_pause ON public.whatsapp_settings;
CREATE TRIGGER prevent_whatsapp_currency_pause
BEFORE INSERT OR UPDATE OF business ON public.whatsapp_settings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_whatsapp_currency_pause();

UPDATE public.whatsapp_settings
SET auto_reply_enabled = true,
    business = jsonb_set(
      jsonb_set(coalesce(business, '{}'::jsonb), '{circuitPaused}', 'false'::jsonb, true),
      '{circuitReason}', '""'::jsonb, true
    ),
    updated_at = now()
WHERE id = 1
  AND business->>'circuitReason' = 'O WhatsApp recusou os envios porque a moeda da conta comercial não está configurada. Defina Real (BRL) no Gerenciador do WhatsApp e ative o robô novamente.';

UPDATE public.whatsapp_conversations AS conversation
SET automation_paused = false,
    automation_pause_reason = NULL,
    attendance_status = 'new',
    awaiting_since = NULL
WHERE conversation.automation_paused = true
  AND conversation.automation_pause_reason = 'human'
  AND conversation.assigned_to IS NULL
  AND conversation.attendance_status = 'needs_reply'
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_messages AS message
    WHERE message.phone = conversation.phone
      AND message.direction = 'out'
      AND message.source = 'auto'
      AND message.status = 'failed'
      AND message.error LIKE '%131042%'
      AND message.created_at >= '2026-11-19 13:43:00+00'::timestamptz
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.whatsapp_order_requests AS request
    WHERE request.phone = conversation.phone
      AND request.status = 'awaiting_acceptance'
  );

UPDATE public.whatsapp_jobs
SET next_attempt_at = now(),
    lease_until = NULL
WHERE state = 'pending'
  AND coalesce(payload->>'automatic', 'false') = 'true';