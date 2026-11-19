CREATE OR REPLACE FUNCTION public.submit_pdv_cashier_direct_paid(request jsonb, payment_method text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE result jsonb; snapshot jsonb; created jsonb;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF nullif(trim(coalesce(payment_method,'')),'') IS NULL THEN RAISE EXCEPTION 'Selecione a forma de pagamento'; END IF;
 IF request->>'type' NOT IN ('Balcão','Mesa','Retirada') OR request->>'type' IS NULL THEN RAISE EXCEPTION 'Venda direta disponível somente para Balcão, Mesa ou Retirada; Delivery deve ser enviado à cozinha'; END IF;
 result=public.submit_pdv_cashier_paid(request,payment_method);
 PERFORM pg_advisory_xact_lock(742021);
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO created FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) value WHERE value->>'id'=request->>'id';
 IF created IS NULL THEN RAISE EXCEPTION 'Não foi possível localizar o pedido criado'; END IF;
 IF NOT (created->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(created->'payments','[]'::jsonb))>0) THEN RAISE EXCEPTION 'Pagamento não confirmado'; END IF;
 IF created->>'status'='retirado' THEN RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','status','retirado','directSale',true); END IF;
 IF created->>'status'<>'cozinha' THEN RAISE EXCEPTION 'Pedido não disponível para venda direta'; END IF;
 UPDATE public.pdv_state SET data=jsonb_set(snapshot,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=request->>'id' THEN value||jsonb_build_object('status','retirado') ELSE value END) FROM jsonb_array_elements(snapshot->'orders') value)),revision=revision+1,updated_at=now() WHERE id=1;
 RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','status','retirado','directSale',true);
END $function$;
REVOKE ALL ON FUNCTION public.submit_pdv_cashier_direct_paid(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_cashier_direct_paid(jsonb,text) TO authenticated;

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
      AND kind <> 'interpret'
      AND NOT (payload ? 'summaryVersion')
      AND coalesce(payload->>'automatic', 'false') = 'true';
  END IF;

  RETURN _enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_whatsapp_auto_reply(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_auto_reply(boolean) TO authenticated;