CREATE OR REPLACE FUNCTION public.wa_confirm_request(_phone text, _inbound_id text, _version integer, _request jsonb, _total numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.whatsapp_conversations; rid uuid; BEGIN
IF _total IS NULL OR _total <= 0 OR jsonb_typeof(_request->'items') <> 'array' OR jsonb_array_length(_request->'items') = 0
  OR EXISTS (SELECT 1 FROM jsonb_array_elements(_request->'items') i WHERE coalesce(i->>'productId','') = '' OR coalesce((i->>'qty')::numeric,0) <= 0 OR coalesce((i->>'quotedPrice')::numeric,0) <= 0)
  OR coalesce(_request->>'type','') NOT IN ('Delivery','Retirada')
  OR coalesce(_request#>>'{delivery,paymentMethod}','') NOT IN ('Pix','Dinheiro','Cartão')
  OR length(trim(coalesce(_request->>'customer',''))) < 2
  OR lower(trim(coalesce(_request->>'customer',''))) ~ '(^| )(pagamento|pix|cartao|cartão|credito|crédito|debito|débito|dinheiro|marmita|quentinha|entrega|delivery|cardapio|cardápio|vcs|voces|vocês)( |$)'
  OR lower(trim(coalesce(_request->>'customer',''))) ~ '(^| )(em frente|ao lado|perto de|proximo a|próximo a)( |$)'
  OR lower(trim(coalesce(_request->>'customer',''))) ~ '^(a|o|no|na|aqui) '
  OR (_request->>'type' = 'Delivery' AND (
    coalesce(_request#>>'{delivery,address,street}','') !~* '^(rua|r\.|av\.?|avenida|travessa|tv\.?|alameda|estrada|rodovia|loteamento|condominio|condomínio|praça|praca)[[:space:]]+[^[:space:]]'
    OR coalesce(_request#>>'{delivery,address,street}','') ~* '(^| )(fica|depois|perto|esquerda|direita)( |$)'
    OR coalesce(_request#>>'{delivery,address,number}','') !~* '^([0-9]{1,5}[a-z]?|s/n)$'
    OR length(trim(coalesce(_request#>>'{delivery,address,neighborhood}',''))) < 2
    OR lower(trim(coalesce(_request#>>'{delivery,address,neighborhood}',''))) ~ '^(de|da|do|nº|no) '
    OR lower(trim(coalesce(_request#>>'{delivery,address,neighborhood}',''))) IN (lower(trim(coalesce(_request->>'customer',''))),lower(trim(coalesce(_request#>>'{delivery,address,street}',''))))
  ))
THEN RETURN NULL; END IF;
SELECT * INTO c FROM public.whatsapp_conversations WHERE phone=_phone FOR UPDATE;
IF c.phone IS NULL OR c.automation_paused OR c.draft_version<>_version OR coalesce((c.draft->>'summarySent')::boolean,false)=false OR (_total IS DISTINCT FROM (c.draft->>'quotedTotal')::numeric) THEN RETURN NULL; END IF;
SELECT id INTO rid FROM public.whatsapp_order_requests WHERE phone=_phone AND status='awaiting_acceptance'; IF rid IS NOT NULL THEN RETURN rid; END IF;
INSERT INTO public.whatsapp_order_requests(phone,inbound_id,request,quoted_total) VALUES(_phone,_inbound_id,_request,_total) ON CONFLICT(inbound_id) DO UPDATE SET inbound_id=EXCLUDED.inbound_id RETURNING id INTO rid;
UPDATE public.whatsapp_conversations SET automation_paused=true,attendance_status='needs_reply',draft_version=draft_version+1 WHERE phone=_phone;
RETURN rid; END $$;
REVOKE ALL ON FUNCTION public.wa_confirm_request(text,text,integer,jsonb,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_confirm_request(text,text,integer,jsonb,numeric) TO service_role;