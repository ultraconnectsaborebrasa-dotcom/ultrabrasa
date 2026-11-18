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
    UPDATE public.whatsapp_jobs
    SET state = 'cancelled',
        processing_error = 'Aviso de estoque esgotado encerrado pela equipe',
        completed_at = now()
    WHERE state = 'pending'
      AND dedup_key LIKE 'stock-exhausted:%'
      AND coalesce(payload->>'automatic', 'false') = 'true';
  END IF;

  RETURN _enabled;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_whatsapp_stock_exhausted(_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _enabled IS NULL THEN
    RAISE EXCEPTION 'Informe se o estoque está esgotado';
  END IF;
  IF NOT public.wa_staff() THEN
    RAISE EXCEPTION 'Sem permissão para alterar o aviso de estoque';
  END IF;

  UPDATE public.whatsapp_settings
  SET business = jsonb_set(coalesce(business, '{}'::jsonb), '{stockExhausted}', to_jsonb(_enabled), true),
      auto_reply_enabled = CASE WHEN _enabled THEN true ELSE auto_reply_enabled END,
      updated_at = now()
  WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração do WhatsApp não encontrada';
  END IF;

  IF _enabled THEN
    UPDATE public.whatsapp_jobs
    SET state = 'cancelled',
        processing_error = 'Roteiro de vendas interrompido: estoque esgotado informado pela equipe',
        completed_at = now()
    WHERE state = 'pending'
      AND kind <> 'interpret'
      AND coalesce(payload->>'automatic', 'false') = 'true';
  ELSE
    UPDATE public.whatsapp_jobs
    SET state = 'cancelled',
        processing_error = 'Aviso de estoque esgotado encerrado pela equipe',
        completed_at = now()
    WHERE state = 'pending'
      AND dedup_key LIKE 'stock-exhausted:%'
      AND coalesce(payload->>'automatic', 'false') = 'true';
  END IF;

  RETURN _enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_whatsapp_auto_reply(boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.set_whatsapp_stock_exhausted(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_auto_reply(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_stock_exhausted(boolean) TO authenticated;