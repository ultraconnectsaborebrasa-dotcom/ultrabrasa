ALTER POLICY state_read ON public.pdv_state USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.read_pdv_operator() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; result jsonb;
BEGIN
IF NOT (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
SELECT jsonb_build_object('products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','category',p->>'category','stock',p->'stock')) FROM jsonb_array_elements(snapshot->'products') p WHERE (p->>'active')::boolean AND (p->>'price')::numeric>0),'[]'::jsonb),'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o->>'id','number',o->'number','type',o->>'type','tableNumber',o->'tableNumber','customer',o->>'customer','status',o->>'status','createdAt',o->'createdAt','note',o->>'note','own',o->>'sellerId'=auth.uid()::text,'items',(SELECT jsonb_agg(jsonb_build_object('name',i->>'name','qty',i->'qty','note',i->>'note')) FROM jsonb_array_elements(o->'items') i))) FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'status' IN ('cozinha','pronto','aberta')),'[]'::jsonb),'ownSales',(SELECT count(*) FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'sellerId'=auth.uid()::text AND o->>'status'='pago'),'ownOrders',(SELECT count(*) FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'sellerId'=auth.uid()::text AND o->>'status'<>'cancelado')) INTO result;
RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_pdv_operator() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_pdv_operator() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_pdv_operator(request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; line jsonb; product jsonb; items jsonb='[]'; products jsonb; order_data jsonb; order_id text; qty integer; table_no integer; sub numeric=0; service numeric=0; actor text; existing jsonb;
BEGIN
IF NOT (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
PERFORM pg_advisory_xact_lock(742019);
SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
IF snapshot IS NULL THEN RAISE EXCEPTION 'O administrador precisa iniciar o PDV'; END IF;
order_id=request->>'id';
IF order_id IS NULL OR length(order_id)>80 THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
SELECT o INTO existing FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'id'=order_id;
IF existing IS NOT NULL THEN
IF existing->>'sellerId'<>auth.uid()::text THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
RETURN jsonb_build_object('number',existing->'number'); END IF;
IF request->>'type' NOT IN ('Balcão','Mesa','Retirada','Delivery') OR request->>'type' IS NULL THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
IF request->>'type'='Mesa' THEN table_no=(request->>'tableNumber')::integer; IF table_no IS NULL OR table_no NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Escolha uma das cinco mesas'; END IF; END IF;
IF jsonb_typeof(request->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(request->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Adicione produtos'; END IF;
products=snapshot->'products';
FOR line IN SELECT value FROM jsonb_array_elements(request->'items') LOOP
qty=(line->>'qty')::integer; IF qty IS NULL OR qty NOT BETWEEN 1 AND 999 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
SELECT p INTO product FROM jsonb_array_elements(products) p WHERE p->>'id'=line->>'productId';
IF product IS NULL OR NOT coalesce((product->>'active')::boolean,false) OR coalesce((product->>'price')::numeric,0)<=0 THEN RAISE EXCEPTION 'Produto indisponível'; END IF;
IF product->>'stock' IS NOT NULL THEN
IF (product->>'stock')::integer<qty THEN RAISE EXCEPTION 'Estoque insuficiente'; END IF;
SELECT jsonb_agg(CASE WHEN p->>'id'=product->>'id' THEN jsonb_set(p,'{stock}',to_jsonb((p->>'stock')::integer-qty)) ELSE p END) INTO products FROM jsonb_array_elements(products) p; END IF;
items=items||jsonb_build_array(jsonb_build_object('uid',gen_random_uuid()::text,'productId',product->>'id','name',product->>'name','price',product->'price','qty',qty,'note',left(coalesce(line->>'note',''),500)));
sub=sub+(product->>'price')::numeric*qty;
END LOOP;
IF request->>'type'='Mesa' AND coalesce((snapshot->'settings'->>'autoServiceOnTable')::boolean,true) THEN service=round(sub*coalesce((snapshot->'settings'->>'serviceFeePct')::numeric,0)/100,2); END IF;
SELECT display_name INTO actor FROM public.profiles WHERE id=auth.uid();
order_data=jsonb_build_object('id',order_id,'number',snapshot->'nextNumber','type',request->>'type','tableNumber',table_no,'customer',left(coalesce(request->>'customer',''),500),'items',items,'note',left(coalesce(request->>'note',''),1000),'discount',0,'fee',CASE WHEN request->>'type'='Delivery' THEN coalesce((snapshot->'settings'->>'deliveryFee')::numeric,0) ELSE 0 END,'serviceFee',service>0,'serviceAmount',service,'payments','[]'::jsonb,'status','cozinha','createdAt',floor(extract(epoch FROM clock_timestamp())*1000),'sellerId',auth.uid(),'sellerName',actor,'source',CASE WHEN request->>'source'='mobile' THEN 'mobile' ELSE 'desktop' END);
snapshot=jsonb_set(snapshot,'{products}',products);
snapshot=jsonb_set(snapshot,'{orders}',jsonb_build_array(order_data)||(snapshot->'orders'));
snapshot=jsonb_set(snapshot,'{nextNumber}',to_jsonb((snapshot->>'nextNumber')::integer+1));
UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
RETURN jsonb_build_object('number',order_data->'number');
END $$;
REVOKE ALL ON FUNCTION public.submit_pdv_operator(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_operator(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_pdv_state(payload jsonb, expected_revision integer) RETURNS public.pdv_state LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public.pdv_state; result public.pdv_state; actor_name text;
BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administrador acessa valores e altera o PDV'; END IF;
PERFORM pg_advisory_xact_lock(742019);
SELECT * INTO current_row FROM public.pdv_state WHERE id=1 FOR UPDATE;
IF coalesce(current_row.revision,0)<>expected_revision THEN RAISE EXCEPTION 'Dados atualizados em outro terminal. Aguarde a sincronização e tente novamente.'; END IF;
IF jsonb_typeof(payload->'orders') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'products') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'settings') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'cash') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Dados inválidos'; END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'orders') o WHERE o->>'type'='Mesa' AND o->>'status'='cozinha' AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(current_row.data->'orders','[]')) prev WHERE prev->>'id'=o->>'id') OR o->'tableNumber' IS NOT NULL AND o->'tableNumber'<>'null'::jsonb) AND (o->>'tableNumber' IS NULL OR (o->>'tableNumber')::integer NOT BETWEEN 1 AND 5)) THEN RAISE EXCEPTION 'Escolha uma das cinco mesas'; END IF;
SELECT display_name INTO actor_name FROM public.profiles WHERE id=auth.uid();
SELECT jsonb_set(payload,'{orders}',coalesce(jsonb_agg(CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(current_row.data->'orders','[]')) prev WHERE prev->>'id'=o->>'id') THEN o||jsonb_build_object('sellerId',auth.uid(),'sellerName',actor_name) ELSE o END),'[]'::jsonb)) INTO payload FROM jsonb_array_elements(payload->'orders') o;
INSERT INTO public.pdv_state(id,data,revision) VALUES(1,payload,1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,revision=pdv_state.revision+1,updated_at=now() RETURNING * INTO result;
RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_pdv_state(jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_pdv_state(jsonb,integer) TO authenticated;