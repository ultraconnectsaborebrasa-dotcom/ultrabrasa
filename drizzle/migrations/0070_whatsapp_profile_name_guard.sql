DO $$
DECLARE src text; marker text;
BEGIN
  SELECT pg_get_functiondef('public.wa_confirm_request(text,text,integer,jsonb,numeric)'::regprocedure) INTO src;
  marker = '  OR lower(trim(coalesce(_request->>''customer'',''''))) ~ ''^(a|o|no|na|aqui) ''';
  src = replace(src, marker,
    '  OR lower(trim(coalesce(_request->>''customer'',''''))) ~ ''^(ok|okay|tudo bem|tbem|ok tudo bem|ok tbem|oi|oi tudo bem|ola|ola tudo bem|bom dia|boa tarde|boa noite|obrigado|obrigada|valeu|sim|nao|não|isso|isso mesmo|certo|perfeito|combinado)$''' || E'\n' || marker
  );
  IF position('ok tudo bem' in src) = 0 THEN RAISE EXCEPTION 'name guard patch failed'; END IF;
  EXECUTE src;
END $$;