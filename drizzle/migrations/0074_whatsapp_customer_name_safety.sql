CREATE OR REPLACE FUNCTION public.whatsapp_customer_name_valid(_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT length(trim(coalesce(_name,''))) BETWEEN 2 AND 120
    AND trim(coalesce(_name,'')) ~* '[a-zà-ú]{2}'
    AND lower(trim(coalesce(_name,''))) !~ '(^| )(pagamento|pedido|pix|cartao|cartão|credito|crédito|debito|débito|dinheiro|marmita|marmitas|quentinha|quentinhas|entrega|entregar|entregue|delivery|cardapio|cardápio|vcs|voces|vocês|em frente|ao lado|perto de|proximo a|próximo a)( |$)'
    AND lower(trim(coalesce(_name,''))) !~ '(^| )(vai|vou|quero|queria|gostaria|preciso|entrega|entregar|entregue|retirar|retirada|buscar|manda|coloca|colocar)( |$)'
    AND lower(trim(coalesce(_name,''))) !~ '^(a|o|no|na|aqui) '
    AND lower(trim(coalesce(_name,''))) !~ '^(ok|okay|tudo bem|tbem|ok tudo bem|ok tbem|oi|oi tudo bem|ola|ola tudo bem|bom dia|boa tarde|boa noite|obrigado|obrigada|valeu|sim|nao|não|isso|isso mesmo|isso ai|certo|perfeito|combinado|pode|pode ser|pode mandar|beleza|blz|fechado|positivo|um|uma|dois|duas|tres|três|quatro|cinco)$';
$$;
REVOKE ALL ON FUNCTION public.whatsapp_customer_name_valid(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_customer_name_valid(text) TO service_role;

CREATE OR REPLACE FUNCTION public.wa_confirm_request(_phone text, _inbound_id text, _version integer, _request jsonb, _total numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.whatsapp_conversations; rid uuid; customer_name text;
BEGIN
  SELECT * INTO c FROM public.whatsapp_conversations WHERE phone=_phone FOR UPDATE;
  IF c.phone IS NULL THEN RETURN NULL; END IF;

  customer_name=left(trim(coalesce(_request->>'customer','')),120);
  IF NOT public.whatsapp_customer_name_valid(customer_name) THEN
    customer_name=left(trim(coalesce(c.name,'')),120);
  END IF;
  IF NOT public.whatsapp_customer_name_valid(customer_name) THEN RETURN NULL; END IF;
  _request=jsonb_set(_request,'{customer}',to_jsonb(customer_name),true);

  IF _total IS NULL OR _total <= 0 OR jsonb_typeof(_request->'items') <> 'array' OR jsonb_array_length(_request->'items') = 0
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(_request->'items') i WHERE coalesce(i->>'productId','') = '' OR coalesce((i->>'qty')::numeric,0) <= 0 OR coalesce((i->>'quotedPrice')::numeric,0) <= 0)
    OR coalesce(_request->>'type','') NOT IN ('Delivery','Retirada')
    OR coalesce(_request#>>'{delivery,paymentMethod}','') NOT IN ('Pix','Dinheiro','Cartão')
    OR (_request->>'type' = 'Delivery' AND (
      coalesce(_request#>>'{delivery,address,street}','') !~* '^(rua|r\.|av\.?|avenida|travessa|tv\.?|alameda|estrada|rodovia|loteamento|condominio|condomínio|praça|praca)[[:space:]]+[^[:space:]]'
      OR coalesce(_request#>>'{delivery,address,street}','') ~* '(^| )(fica|depois|perto|esquerda|direita)( |$)'
      OR coalesce(_request#>>'{delivery,address,number}','') !~* '^([0-9]{1,5}[a-z]?|s/n)$'
      OR length(trim(coalesce(_request#>>'{delivery,address,neighborhood}',''))) < 2
      OR lower(trim(coalesce(_request#>>'{delivery,address,neighborhood}',''))) ~ '^(de|da|do|nº|no) '
      OR lower(trim(coalesce(_request#>>'{delivery,address,neighborhood}',''))) IN (lower(trim(customer_name)),lower(trim(coalesce(_request#>>'{delivery,address,street}',''))))
    ))
    OR c.automation_paused OR c.draft_version<>_version
    OR coalesce((c.draft->>'summarySent')::boolean,false)=false
    OR (_total IS DISTINCT FROM (c.draft->>'quotedTotal')::numeric)
  THEN RETURN NULL; END IF;

  SELECT id INTO rid FROM public.whatsapp_order_requests WHERE phone=_phone AND status='awaiting_acceptance';
  IF rid IS NOT NULL THEN RETURN rid; END IF;
  INSERT INTO public.whatsapp_order_requests(phone,inbound_id,request,quoted_total)
    VALUES(_phone,_inbound_id,_request,_total)
    ON CONFLICT(inbound_id) DO UPDATE SET inbound_id=EXCLUDED.inbound_id
    RETURNING id INTO rid;
  UPDATE public.whatsapp_conversations
    SET automation_paused=true,automation_pause_reason='order_confirmed',order_confirmed_at=now(),attendance_status='needs_reply',draft_version=draft_version+1
    WHERE phone=_phone;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.wa_confirm_request(text,text,integer,jsonb,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_confirm_request(text,text,integer,jsonb,numeric) TO service_role;