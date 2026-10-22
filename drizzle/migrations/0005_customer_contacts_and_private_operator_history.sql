CREATE TABLE public.pdv_customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT '', phone text UNIQUE, promotion_consent boolean NOT NULL DEFAULT false, consent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.pdv_customers TO authenticated;
GRANT UPDATE(promotion_consent) ON public.pdv_customers TO authenticated;
GRANT ALL ON public.pdv_customers TO service_role;
ALTER TABLE public.pdv_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_admin_read ON public.pdv_customers FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE POLICY customers_admin_revoke ON public.pdv_customers FOR UPDATE TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.prevent_customer_consent_grant() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF current_user='authenticated' AND NEW.promotion_consent AND NOT OLD.promotion_consent THEN RAISE EXCEPTION 'A autorização deve ser registrada durante o atendimento'; END IF; RETURN NEW; END $$;
CREATE TRIGGER prevent_customer_consent_grant BEFORE UPDATE ON public.pdv_customers FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_consent_grant();
CREATE TABLE public.pdv_customer_visits (order_id text PRIMARY KEY, customer_id uuid NOT NULL REFERENCES public.pdv_customers(id), seller_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.pdv_customer_visits TO authenticated;
GRANT ALL ON public.pdv_customer_visits TO service_role;
ALTER TABLE public.pdv_customer_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY visits_admin_read ON public.pdv_customer_visits FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX customer_visits_customer ON public.pdv_customer_visits(customer_id);
CREATE FUNCTION public.submit_pdv_operator_with_contact(request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; snapshot jsonb; existing jsonb; contact_id uuid; phone_digits text; contact_name text; consent boolean;
BEGIN
 IF NOT (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.submit_pdv_operator_with_contact(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_operator_with_contact(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.read_pdv_operator() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; active_orders jsonb; own_history jsonb;
BEGIN
 IF NOT (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o->>'id','number',o->'number','type',o->>'type','tableNumber',o->'tableNumber','customer',o->>'customer','customerPhone',CASE WHEN o->>'sellerId'=auth.uid()::text THEN o->>'customerPhone' ELSE NULL END,'status',o->>'status','createdAt',o->'createdAt','note',o->>'note','own',o->>'sellerId'=auth.uid()::text,'total',(SELECT greatest(0,coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,CASE WHEN coalesce((o->>'serviceFee')::boolean,false) THEN round(coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0)*coalesce((snapshot->'settings'->>'serviceFeePct')::numeric,0)/100,2) ELSE 0 END)) FROM jsonb_array_elements(o->'items') i),'items',(SELECT jsonb_agg(jsonb_build_object('name',i->>'name','qty',i->'qty','price',i->'price','note',i->>'note')) FROM jsonb_array_elements(o->'items') i)) ORDER BY (o->>'createdAt')::numeric DESC),'[]'::jsonb) INTO active_orders FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'status' IN ('cozinha','pronto','aberta');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o->>'id','number',o->'number','type',o->>'type','tableNumber',o->'tableNumber','customer',o->>'customer','customerPhone',o->>'customerPhone','status',o->>'status','createdAt',o->'createdAt','paidAt',o->'paidAt','note',o->>'note','items',(SELECT jsonb_agg(jsonb_build_object('name',i->>'name','qty',i->'qty','note',i->>'note')) FROM jsonb_array_elements(o->'items') i)) ORDER BY (o->>'createdAt')::numeric DESC),'[]'::jsonb) INTO own_history FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'sellerId'=auth.uid()::text;
 RETURN jsonb_build_object('products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','category',p->>'category','stock',p->'stock','price',p->'price')) FROM jsonb_array_elements(snapshot->'products') p WHERE (p->>'active')::boolean AND (p->>'price')::numeric>0),'[]'::jsonb),'orders',active_orders,'history',own_history,'ownSales',(SELECT count(*) FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'sellerId'=auth.uid()::text AND o->>'status'='pago'),'ownOrders',(SELECT count(*) FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'sellerId'=auth.uid()::text AND o->>'status'<>'cancelado'));
END $$;
REVOKE ALL ON FUNCTION public.read_pdv_operator() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_pdv_operator() TO authenticated;