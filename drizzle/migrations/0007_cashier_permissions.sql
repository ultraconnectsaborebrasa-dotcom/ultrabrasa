-- APIs de caixa com permissões verificadas no servidor.
CREATE OR REPLACE FUNCTION public.read_pdv_cashier() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'cashier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 RETURN jsonb_build_object(
  'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','category',p->>'category','price',p->'price','stock',p->'stock','active',p->'active')) FROM jsonb_array_elements(coalesce(snapshot->'products','[]'::jsonb)) p),'[]'::jsonb),
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o->>'id','number',o->'number','type',o->>'type','tableNumber',o->'tableNumber','customer',o->>'customer','status',o->>'status','total',greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(o->'items') i)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,0)),'items',(SELECT jsonb_agg(jsonb_build_object('name',i->>'name','qty',i->'qty','price',i->'price')) FROM jsonb_array_elements(o->'items') i))) FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) o WHERE o->>'status' IN ('aberta','cozinha','pronto')),'[]'::jsonb),
  'paymentMethods',coalesce(snapshot->'settings'->'paymentMethods','[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.read_pdv_cashier() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_pdv_cashier() TO authenticated;

CREATE FUNCTION public.pay_pdv_cashier(order_id text, payment_method text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; target jsonb; total numeric; methods jsonb; updated jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'cashier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT o INTO target FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'id'=order_id;
 IF target IS NULL OR target->>'status' NOT IN ('aberta','cozinha','pronto') THEN RAISE EXCEPTION 'Comanda não disponível para pagamento'; END IF;
 methods=coalesce(snapshot->'settings'->'paymentMethods','[]'::jsonb);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(methods) m WHERE m=payment_method) THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;
 total=greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(target->'items') i)-coalesce((target->>'discount')::numeric,0)+coalesce((target->>'fee')::numeric,0)+coalesce((target->>'serviceAmount')::numeric,0));
 updated=target||jsonb_build_object('status','pago','paidAt',floor(extract(epoch FROM clock_timestamp())*1000),'payments',jsonb_build_array(jsonb_build_object('method',payment_method,'amount',total)),'cashierId',auth.uid()::text);
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN o->>'id'=order_id THEN updated ELSE o END)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') o;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION public.pay_pdv_cashier(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pay_pdv_cashier(text,text) TO authenticated;

CREATE FUNCTION public.save_pdv_cashier_product(product_id text, product_name text, product_category text, product_price numeric, product_stock integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; existing jsonb; replacement jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'cashier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF length(trim(coalesce(product_name,''))) NOT BETWEEN 1 AND 120 OR length(coalesce(product_category,''))>80 OR product_price IS NULL OR product_price<0 OR product_price>1000000 OR (product_stock IS NOT NULL AND (product_stock<0 OR product_stock>1000000)) THEN RAISE EXCEPTION 'Dados de produto inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 IF product_id IS NOT NULL AND product_id<>'' THEN
  SELECT p INTO existing FROM jsonb_array_elements(snapshot->'products') p WHERE p->>'id'=product_id;
  IF existing IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  replacement=existing||jsonb_build_object('name',trim(product_name),'category',product_category,'price',product_price,'stock',product_stock);
  SELECT jsonb_set(snapshot,'{products}',jsonb_agg(CASE WHEN p->>'id'=product_id THEN replacement ELSE p END)) INTO snapshot FROM jsonb_array_elements(snapshot->'products') p;
 ELSE
  replacement=jsonb_build_object('id',gen_random_uuid()::text,'name',trim(product_name),'category',product_category,'price',product_price,'cost',0,'stock',product_stock,'minStock',5,'favorite',false,'active',true);
  snapshot=jsonb_set(snapshot,'{products}',coalesce(snapshot->'products','[]'::jsonb)||jsonb_build_array(replacement));
 END IF;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION public.save_pdv_cashier_product(text,text,text,numeric,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_pdv_cashier_product(text,text,text,numeric,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_pdv_access(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(742020);
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') OR target=auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF public.has_role(target,'admin') OR EXISTS(SELECT 1 FROM auth.users WHERE id=target AND lower(email)='ultraconnectsaborebrasa@gmail.com') THEN RAISE EXCEPTION 'Contas administradoras são protegidas'; END IF;
 DELETE FROM public.user_roles WHERE user_id=target AND role IN ('operator','cashier');
END $$;
