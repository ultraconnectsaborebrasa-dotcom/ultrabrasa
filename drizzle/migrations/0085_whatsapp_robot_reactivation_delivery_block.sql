CREATE OR REPLACE FUNCTION public.set_whatsapp_auto_reply(_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _enabled IS NULL THEN
    RAISE EXCEPTION 'Informe se o robô deve ser ativado ou desativado';
  END IF;
  IF NOT public.wa_staff() THEN
    RAISE EXCEPTION 'Sem permissão para alterar o robô';
  END IF;

  UPDATE public.whatsapp_settings
  SET auto_reply_enabled = _enabled,
      business = jsonb_set(coalesce(business, '{}'::jsonb), '{stockExhausted}', 'false'::jsonb, true),
      updated_at = now()
  WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração do WhatsApp não encontrada';
  END IF;

  IF NOT _enabled THEN
    UPDATE public.whatsapp_jobs
    SET state = 'cancelled',
        processing_error = 'Resposta automática cancelada: robô desativado pela equipe',
        completed_at = now()
    WHERE state = 'pending'
      AND coalesce(payload->>'automatic', 'false') = 'true';
  ELSE
    UPDATE public.whatsapp_settings
    SET business = jsonb_set(
          jsonb_set(business, '{circuitPaused}', 'false'::jsonb, true),
          '{circuitReason}', '""'::jsonb, true
        ),
        updated_at = now()
    WHERE id = 1;

    UPDATE public.whatsapp_jobs
    SET state = 'cancelled',
        processing_error = 'Resposta antiga cancelada na reativação; o robô responderá a novas mensagens',
        completed_at = now()
    WHERE state = 'pending'
      AND coalesce(payload->>'automatic', 'false') = 'true';
  END IF;

  RETURN _enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_whatsapp_auto_reply(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_auto_reply(boolean) TO authenticated;

UPDATE public.whatsapp_settings
SET business = jsonb_set(
      jsonb_set(coalesce(business, '{}'::jsonb), '{circuitPaused}', 'true'::jsonb, true),
      '{circuitReason}',
      to_jsonb('O WhatsApp recusou os envios porque a moeda da conta comercial não está configurada. Defina Real (BRL) no Gerenciador do WhatsApp e ative o robô novamente.'::text),
      true
    ),
    updated_at = now()
WHERE id = 1
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_messages
    WHERE direction = 'out'
      AND source = 'auto'
      AND status = 'failed'
      AND error LIKE '%131042%'
      AND created_at > now() - interval '24 hours'
  );