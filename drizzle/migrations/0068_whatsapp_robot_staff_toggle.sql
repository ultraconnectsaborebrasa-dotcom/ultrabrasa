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
  SET auto_reply_enabled = _enabled, updated_at = now()
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
  END IF;

  RETURN _enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_whatsapp_auto_reply(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_auto_reply(boolean) TO authenticated;