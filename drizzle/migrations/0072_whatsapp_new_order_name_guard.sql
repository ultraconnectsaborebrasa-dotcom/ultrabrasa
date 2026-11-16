DO $$ DECLARE src text; target text; replacement text; BEGIN
 SELECT pg_get_functiondef('public.wa_confirm_request(text,text,integer,jsonb,numeric)'::regprocedure) INTO src;
 target='(pagamento|pix|cartao|cartão|credito|crédito|debito|débito|dinheiro|marmita|quentinha|entrega|delivery|cardapio|cardápio|vcs|voces|vocês)';
 replacement='(pagamento|pedido|pix|cartao|cartão|credito|crédito|debito|débito|dinheiro|marmita|quentinha|entrega|delivery|cardapio|cardápio|vcs|voces|vocês)';
 IF position(target IN src)=0 THEN RAISE EXCEPTION 'customer order-word guard insertion point missing'; END IF;
 EXECUTE replace(src,target,replacement);
END $$;