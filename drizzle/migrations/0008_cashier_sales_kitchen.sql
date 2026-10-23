-- Caixa: vendas, envio para cozinha e atualização do preparo, sem acesso a relatórios financeiros.
CREATE OR REPLACE FUNCTION public.read_pdv_cashier() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'cashier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 RETURN jsonb_build_object(
  'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','category',p->>'category','price',p->'price','stock',p->'stock','active',p->'active')) FROM jsonb_array_elements(coalesce(snapshot->'products','[]'::jsonb)) p WHERE coalesce((p->>'active')::boolean,false) AND coalesce((p->>'price')::numeric,0)>0),'[]'::jsonb),
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o->>'id','number',o->'number','type',o->>'type','tableNumber',o->'tableNumber','customer',o->>'customer','status',o->>'status','total',greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(coalesce(o->'items','[]'::jsonb)) i)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,CASE WHEN coalesce((o->>'serviceFee')::boolean,false) THEN round((SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(coalesce(o->'items','[]'::jsonb)) i)*coalesce((snapshot->'settings'->>'serviceFeePct')::numeric,0)/100,2) ELSE 0 END)),'createdAt',o->'createdAt','note',o->>'note','items',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',i->>'name','productId',i->>'productId','qty',i->'qty','price',i->'price','note',i->>'note')),'[]'::jsonb) FROM jsonb_array_elements(coalesce(o->'items','[]'::jsonb)) i))) ORDER BY (o->>'createdAt')::numeric DESC) FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) o WHERE o->>'status' IN ('aberta','cozinha','pronto')),'[]'::jsonb),
  'paymentMethods',coalesce(snapshot->'settings'->'paymentMethods','[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.submit_pdv_cashier_order(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; product jsonb; raw_item jsonb; cooked_items jsonb:='[]'::jsonb; updated_products jsonb; new_order jsonb; next_number integer; qty integer; stock_value numeric; price_value numeric; subtotal_value numeric:=0; service_value numeric:=0; fee_value numeric:=0; order_type text; table_value integer; product_id text; item_note text; order_id text; created_ms bigint; actor_name text;
BEGIN
 IF NOT public.has_role(auth.uid(),'cashier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF jsonb_typeof(request->'items')<>'array' OR jsonb_array_length(request->'items')<1 OR jsonb_array_length(request->'items')>100 THEN RAISE EXCEPTION 'Adicione produtos ao pedido'; END IF;
 order_type=coalesce(request->>'type','Balcão');
 IF order_type NOT IN ('Balcão','Mesa','Retirada','Delivery') THEN RAISE EXCEPTION 'Tipo de pedido inválido'; END IF;
 IF order_type='Mesa' AND coalesce((request->>'tableNumber')::integer,0) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Escolha uma das cinco mesas'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 FOR raw_item IN SELECT value FROM jsonb_array_elements(request->'items') LOOP
  product_id=raw_item->>'productId'; qty=coalesce((raw_item->>'qty')::integer,0);
  IF qty<1 OR qty>100 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT p INTO product FROM jsonb_array_elements(snapshot->'products') p WHERE p->>'id'=product_id AND coalesce((p->>'active')::boolean,false) AND coalesce((p->>'price')::numeric,0)>0;
  IF product IS NULL THEN RAISE EXCEPTION 'Produto indisponível: %',product_id; END IF;
  stock_value=nullif(product->>'stock','')::numeric;
  IF stock_value IS NOT NULL AND stock_value<qty THEN RAISE EXCEPTION 'Estoque insuficiente para %',product->>'name'; END IF;
  price_value=(product->>'price')::numeric; subtotal_value=subtotal_value+price_value*qty;
  item_note=left(coalesce(raw_item->>'note',''),240);
  cooked_items=cooked_items||jsonb_build_array(jsonb_build_object('uid',gen_random_uuid()::text,'productId',product_id,'name',product->>'name','price',price_value,'qty',qty,'note',item_note));
 END LOOP;
 IF order_type='Delivery' THEN fee_value=coalesce((snapshot->'settings'->>'deliveryFee')::numeric,0); END IF;
 IF order_type='Mesa' AND coalesce((snapshot->'settings'->>'autoServiceOnTable')::boolean,true) THEN service_value=round(subtotal_value*coalesce((snapshot->'settings'->>'serviceFeePct')::numeric,0)/100,2); END IF;
 SELECT coalesce(max((o->>'number')::integer),0)+1 INTO next_number FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) o;
 created_ms=floor(extract(epoch FROM clock_timestamp())*1000); order_id=gen_random_uuid()::text;
 SELECT display_name INTO actor_name FROM public.profiles WHERE id=auth.uid();
 new_order=jsonb_build_object('id',order_id,'number',next_number,'type',order_type,'customer',left(trim(coalesce(request->>'customer','')),120),'items',cooked_items,'note',left(coalesce(request->>'note',''),1000),'discount',0,'fee',fee_value,'serviceFee',service_value>0,'serviceAmount',service_value,'payments','[]'::jsonb,'status','cozinha','createdAt',created_ms,'sellerId',auth.uid()::text,'sellerName',coalesce(actor_name,'Caixa'),'tableNumber',CASE WHEN order_type='Mesa' THEN (request->>'tableNumber')::integer ELSE NULL END,'source','desktop');
 SELECT jsonb_set(snapshot,'{products}',coalesce(jsonb_agg(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(cooked_items) i WHERE i->>'productId'=p->>'id') AND nullif(p->>'stock','') IS NOT NULL THEN p||jsonb_build_object('stock',(p->>'stock')::integer-(SELECT sum((i->>'qty')::integer) FROM jsonb_array_elements(cooked_items) i WHERE i->>'productId'=p->>'id')) ELSE p END),'[]'::jsonb)) INTO snapshot FROM jsonb_array_elements(coalesce(snapshot->'products','[]'::jsonb)) p;
 snapshot=jsonb_set(snapshot,'{orders}',jsonb_build_array(new_order)||coalesce(snapshot->'orders','[]'::jsonb));
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
 RETURN jsonb_build_object('id',order_id,'number',next_number);
END $$;
REVOKE ALL ON FUNCTION public.submit_pdv_cashier_order(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_cashier_order(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_pdv_cashier_kitchen(order_id text, new_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; target jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'cashier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF new_status NOT IN ('cozinha','pronto') THEN RAISE EXCEPTION 'Status de cozinha inválido'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT o INTO target FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) o WHERE o->>'id'=order_id;
 IF target IS NULL OR target->>'status' NOT IN ('aberta','cozinha','pronto') THEN RAISE EXCEPTION 'Pedido não está em andamento'; END IF;
 IF target->>'status'='pronto' AND new_status='cozinha' THEN RAISE EXCEPTION 'Pedido já está pronto'; END IF;
 target=target||jsonb_build_object('status',new_status);
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN o->>'id'=order_id THEN target ELSE o END)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') o;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION public.update_pdv_cashier_kitchen(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_pdv_cashier_kitchen(text,text) TO authenticated;
