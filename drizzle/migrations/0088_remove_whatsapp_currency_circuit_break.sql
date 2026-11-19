UPDATE public.whatsapp_settings
SET auto_reply_enabled = true,
    business = jsonb_set(
      jsonb_set(coalesce(business, '{}'::jsonb), '{circuitPaused}', 'false'::jsonb, true),
      '{circuitReason}', '""'::jsonb, true
    ),
    updated_at = now()
WHERE id = 1
  AND business->>'circuitReason' = 'O WhatsApp recusou os envios porque a moeda da conta comercial não está configurada. Defina Real (BRL) no Gerenciador do WhatsApp e ative o robô novamente.';

UPDATE public.whatsapp_jobs
SET next_attempt_at = now(),
    lease_until = NULL
WHERE state = 'pending'
  AND coalesce(payload->>'automatic', 'false') = 'true';