CREATE OR REPLACE FUNCTION public.update_pdv_open_order(order_id text,input_items jsonb,order_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
 snapshot jsonb; target jsonb; item jsonb; previous jsonb; prod jsonb; products jsonb;
 new_items jsonb := '[]'::jsonb; product_id text; q integer; old_qty integer; new_qty integer;
 available numeric; new_subtotal numeric := 0; service_amount numeric := 0;
 item_price numeric; item_name text; item_uid text; assigned_courier uuid;
 stock_row public.courier_marmita_stock; reserved integer; new_marmitas integer;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Somente o administrador ou o caixa pode editar a comanda'; END IF;
 IF jsonb_typeof(input_items)<>'array' OR jsonb_array_length(input_items)<1 OR jsonb_array_length(input_items)>50 THEN RAISE EXCEPTION 'A comanda precisa ter entre 1 e 50 itens'; END IF;
 IF length(coalesce(order_note,''))>1000 THEN RAISE EXCEPTION 'Observação geral muito longa'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT o INTO target FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) o WHERE o->>'id'=update_pdv_open_order.order_id;
 IF target IS NULL OR target->>'status' NOT IN ('aberta','cozinha','pronto') THEN RAISE EXCEPTION 'Comanda não está aberta para edição'; END IF;
 IF target->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(target->'payments','[]'::jsonb))>0 THEN RAISE EXCEPTION 'Comanda com pagamento não pode ser editada'; END IF;
 products=snapshot->'products';
 FOR item IN SELECT value FROM jsonb_array_elements(input_items) LOOP
  q := (item->>'qty')::integer;
  IF q IS NULL OR q<1 OR q>99 OR length(coalesce(item->>'note',''))>200 THEN RAISE EXCEPTION 'Quantidade ou observação inválida'; END IF;
  previous=NULL;
  SELECT old INTO previous FROM jsonb_array_elements(target->'items') old WHERE nullif(item->>'uid','') IS NOT NULL AND old->>'uid'=item->>'uid' LIMIT 1;
  IF previous IS NOT NULL THEN
   product_id=previous->>'productId'; item_price=(previous->>'price')::numeric; item_name=previous->>'name'; item_uid=previous->>'uid';
   SELECT p INTO prod FROM jsonb_array_elements(products) p WHERE p->>'id'=product_id;
  ELSE
   product_id=item->>'productId';
   SELECT p INTO prod FROM jsonb_array_elements(products) p WHERE p->>'id'=product_id AND coalesce((p->>'active')::boolean,true);
   IF prod IS NULL OR coalesce((prod->>'price')::numeric,0)<=0 THEN RAISE EXCEPTION 'Produto indisponível'; END IF;
   item_price=(prod->>'price')::numeric; item_name=prod->>'name'; item_uid=substr(gen_random_uuid()::text,1,8);
  END IF;
  IF product_id IS NULL OR product_id='' THEN RAISE EXCEPTION 'Produto sem cadastro'; END IF;
  new_items=new_items||jsonb_build_array(jsonb_build_object('uid',item_uid,'productId',product_id,'name',item_name,'price',item_price,'qty',q,'note',coalesce(item->>'note','')));
  new_subtotal=new_subtotal+item_price*q;
 END LOOP;
 FOR product_id IN SELECT DISTINCT value->>'productId' FROM (SELECT value FROM jsonb_array_elements(target->'items') UNION ALL SELECT value FROM jsonb_array_elements(new_items)) all_items LOOP
  SELECT coalesce(sum((old->>'qty')::integer),0) INTO old_qty FROM jsonb_array_elements(target->'items') old WHERE old->>'productId'=product_id;
  SELECT coalesce(sum((new_item->>'qty')::integer),0) INTO new_qty FROM jsonb_array_elements(new_items) new_item WHERE new_item->>'productId'=product_id;
  SELECT p INTO prod FROM jsonb_array_elements(products) p WHERE p->>'id'=product_id;
  IF prod IS NOT NULL AND prod->'stock' IS NOT NULL AND old_qty<>new_qty THEN
   available=(prod->>'stock')::numeric+old_qty;
   IF new_qty>available THEN RAISE EXCEPTION 'Estoque insuficiente: %. Disponível nesta edição: %',prod->>'name',greatest(0,available); END IF;
   SELECT jsonb_agg(CASE WHEN p->>'id'=product_id AND p->'stock' IS NOT NULL THEN jsonb_set(p,'{stock}',to_jsonb(available-new_qty)) ELSE p END) INTO products FROM jsonb_array_elements(products) p;
  END IF;
 END LOOP;
 IF coalesce((target->>'serviceFee')::boolean,false) THEN service_amount=round(new_subtotal*coalesce((snapshot->'settings'->>'serviceFeePct')::numeric,0))/100; END IF;
 snapshot=jsonb_set(snapshot,'{products}',products);
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN o->>'id'=update_pdv_open_order.order_id THEN o||jsonb_build_object('items',new_items,'note',coalesce(order_note,''),'serviceAmount',service_amount) ELSE o END)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') o;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
 UPDATE public.delivery_orders SET items=new_items WHERE order_id=update_pdv_open_order.order_id;
 SELECT coalesce(r.courier_id,d.assigned_courier_id) INTO assigned_courier FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.order_id=update_pdv_open_order.order_id;
 new_marmitas=public.delivery_marmita_quantity(update_pdv_open_order.order_id);
 IF assigned_courier IS NOT NULL AND new_marmitas>0 THEN
  SELECT s.* INTO stock_row FROM public.courier_marmita_stock s WHERE s.courier_id=assigned_courier FOR UPDATE;
  IF stock_row.courier_id IS NULL THEN RAISE EXCEPTION 'Registre a carga do entregador antes de editar as marmitas desta entrega'; END IF;
  SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0)::integer INTO reserved FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status NOT IN ('Entregue','Cancelado') AND coalesce(r.courier_id,d.assigned_courier_id)=assigned_courier;
  IF reserved>stock_row.remaining_quantity THEN RAISE EXCEPTION 'Marmitas insuficientes na carga do entregador: % disponível(is) e % reservada(s)',stock_row.remaining_quantity,reserved; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(new_items) i WHERE position('marmita' in lower(coalesce(i.value->>'name','')))>0 AND NOT(CASE WHEN i.value->>'productId' IS NOT NULL THEN i.value->>'productId'=stock_row.product_id ELSE lower(trim(i.value->>'name'))=lower(trim(stock_row.product_name)) END)) THEN RAISE EXCEPTION 'A carga atual de % não é compatível com as marmitas editadas',stock_row.product_name; END IF;
 END IF;
 RETURN jsonb_build_object('orderId',order_id,'number',target->'number','items',new_items,'note',coalesce(order_note,''),'serviceAmount',service_amount);
END $function$;
REVOKE ALL ON FUNCTION public.update_pdv_open_order(text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_pdv_open_order(text,jsonb,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.read_pdv_cashier()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE snapshot jsonb; day_start bigint;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 day_start=floor(extract(epoch FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date)*1000);
 RETURN jsonb_build_object(
 'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','category',p->>'category','price',p->'price','stock',p->'stock','active',p->'active')) FROM jsonb_array_elements(coalesce(snapshot->'products','[]')) p),'[]'),
 'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o->>'id','number',o->'number','type',o->>'type','tableNumber',o->'tableNumber','customer',o->>'customer','customerPhone',o->>'customerPhone','status',o->>'status','paymentStatus',o->>'paymentStatus','hasPayment',jsonb_array_length(coalesce(o->'payments','[]'))>0,'createdAt',o->'createdAt','note',o->>'note','discount',coalesce(o->>'discount','0')::numeric,'fee',coalesce(o->>'fee','0')::numeric,'serviceFee',coalesce((o->>'serviceFee')::boolean,false),'serviceAmount',coalesce(o->>'serviceAmount','0')::numeric,'total',greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(o->'items') i)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,0)),'items',(SELECT jsonb_agg(jsonb_build_object('uid',i->>'uid','productId',i->>'productId','name',i->>'name','qty',i->'qty','price',i->'price','note',i->'note')) FROM jsonb_array_elements(o->'items') i)) ORDER BY (o->>'createdAt')::bigint) FROM jsonb_array_elements(coalesce(snapshot->'orders','[]')) o WHERE o->>'status' IN ('aberta','cozinha','pronto','entrega') OR (o->>'status' IN ('entregue','retirado','pago') AND coalesce((o->>'paidAt')::bigint,(o->>'createdAt')::bigint)>=day_start)),'[]'),
 'deliveryFee',coalesce((snapshot->'settings'->>'deliveryFee')::numeric,0),'serviceFeePct',coalesce((snapshot->'settings'->>'serviceFeePct')::numeric,0),'paymentMethods',coalesce(snapshot->'settings'->'paymentMethods','[]'));
END $function$;