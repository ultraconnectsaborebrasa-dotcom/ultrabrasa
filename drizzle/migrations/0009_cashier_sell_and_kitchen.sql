-- Caixa também pode vender (preços/estoque calculados no servidor) e avançar pedidos na cozinha.
CREATE OR REPLACE FUNCTION public.submit_pdv_operator_with_contact(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb; snapshot jsonb; existing jsonb; contact_id uuid; phone_digits text; contact_name text; consent boolean;
BEGIN
 IF NOT (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 contact_name=left(trim(coalesce(request->>'customer','')),120);
 phone_digits=regexp_replace(coalesce(request->>'customerPhone',''),'[^0-9]','','g');
 IF length(phone_digits) IN (10,11) THEN phone_digits='55'||phone_digits; END IF;
 IF phone_digits<>'' AND phone_digits !~ '^[1-9][0-9]{9,14}$' THEN RAISE EXCEPTION 'WhatsApp inválido. Informe DDD e número'; END IF;
 consent=coalesce((request->>'promotionConsent')::boolean,false);
 IF consent AND phone_digits='' THEN RAISE EXCEPTION 'Informe o WhatsApp para registrar autorização'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT o INTO existing FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'id'=request->>'id';
 result=public.submit_pdv_operator(request||jsonb_build_object('customer',contact_name));
 IF existing IS NOT NULL THEN RETURN result; END IF;
 IF contact_name<>'' OR phone_digits<>'' THEN
  IF phone_digits<>'' THEN
   INSERT INTO public.pdv_customers(name,phone,promotion_consent,consent_at) VALUES(contact_name,phone_digits,consent,CASE WHEN consent THEN now() END)
   ON CONFLICT(phone) DO UPDATE SET name=CASE WHEN EXCLUDED.name<>'' THEN EXCLUDED.name ELSE pdv_customers.name END,promotion_consent=pdv_customers.promotion_consent OR EXCLUDED.promotion_consent,consent_at=CASE WHEN EXCLUDED.promotion_consent THEN now() ELSE pdv_customers.consent_at END,updated_at=now() RETURNING id INTO contact_id;
  ELSE INSERT INTO public.pdv_customers(name) VALUES(contact_name) RETURNING id INTO contact_id; END IF;
  INSERT INTO public.pdv_customer_visits(order_id,customer_id,seller_id) VALUES(request->>'id',contact_id,auth.uid());
 END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN o->>'id'=request->>'id' THEN o||jsonb_build_object('customerPhone',phone_digits,'customerId',contact_id,'promotionConsent',consent) ELSE o END)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') o;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
 RETURN result;
END $function$;

CREATE FUNCTION public.advance_pdv_cashier_order(order_id text, new_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; target jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'cashier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF new_status NOT IN ('cozinha','pronto') THEN RAISE EXCEPTION 'Status inválido'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT o INTO target FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'id'=order_id;
 IF target IS NULL OR target->>'status' NOT IN ('aberta','cozinha') THEN RAISE EXCEPTION 'Comanda não disponível'; END IF;
 IF new_status='pronto' AND target->>'status'<>'cozinha' THEN RAISE EXCEPTION 'Envie a comanda à cozinha antes'; END IF;
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN o->>'id'=order_id THEN o||jsonb_build_object('status',new_status) ELSE o END)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') o;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION public.advance_pdv_cashier_order(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_pdv_cashier_order(text,text) TO authenticated;