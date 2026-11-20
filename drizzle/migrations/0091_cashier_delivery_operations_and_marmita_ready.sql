CREATE OR REPLACE FUNCTION public.submit_pdv_operator(request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE snapshot jsonb; line jsonb; product jsonb; items jsonb='[]'; products jsonb; order_data jsonb; order_id text; qty integer; table_no integer; sub numeric=0; service numeric=0; actor text; existing jsonb; marmita_only boolean=true;
BEGIN
 IF NOT (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'O administrador precisa iniciar o PDV'; END IF;
 order_id=request->>'id';
 IF order_id IS NULL OR length(order_id)>80 THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
 SELECT o INTO existing FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'id'=order_id;
 IF existing IS NOT NULL THEN
  IF existing->>'sellerId'<>auth.uid()::text THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
  RETURN jsonb_build_object('number',existing->'number','status',existing->'status');
 END IF;
 IF request->>'type' NOT IN ('Balcão','Mesa','Retirada','Delivery') OR request->>'type' IS NULL THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
 IF request->>'type'='Mesa' THEN table_no=(request->>'tableNumber')::integer; IF table_no IS NULL OR table_no NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Escolha uma das cinco mesas'; END IF; END IF;
 IF jsonb_typeof(request->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(request->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Adicione produtos'; END IF;
 products=snapshot->'products';
 FOR line IN SELECT value FROM jsonb_array_elements(request->'items') LOOP
  qty=(line->>'qty')::integer; IF qty IS NULL OR qty NOT BETWEEN 1 AND 999 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT p INTO product FROM jsonb_array_elements(products) p WHERE p->>'id'=line->>'productId';
  IF product IS NULL OR NOT coalesce((product->>'active')::boolean,false) OR coalesce((product->>'price')::numeric,0)<=0 THEN RAISE EXCEPTION 'Produto indisponível'; END IF;
  IF lower(btrim(coalesce(product->>'category','')))<>'marmitas' THEN marmita_only=false; END IF;
  IF product->>'stock' IS NOT NULL THEN
   IF (product->>'stock')::integer<qty THEN RAISE EXCEPTION 'Estoque insuficiente'; END IF;
   SELECT jsonb_agg(CASE WHEN p->>'id'=product->>'id' THEN jsonb_set(p,'{stock}',to_jsonb((p->>'stock')::integer-qty)) ELSE p END) INTO products FROM jsonb_array_elements(products) p;
  END IF;
  items=items||jsonb_build_array(jsonb_build_object('uid',gen_random_uuid()::text,'productId',product->>'id','name',product->>'name','price',product->'price','qty',qty,'note',left(coalesce(line->>'note',''),500)));
  sub=sub+(product->>'price')::numeric*qty;
 END LOOP;
 IF request->>'type'='Mesa' AND coalesce((snapshot->'settings'->>'autoServiceOnTable')::boolean,true) THEN service=round(sub*coalesce((snapshot->'settings'->>'serviceFeePct')::numeric,0)/100,2); END IF;
 SELECT display_name INTO actor FROM public.profiles WHERE id=auth.uid();
 order_data=jsonb_build_object('id',order_id,'number',snapshot->'nextNumber','type',request->>'type','tableNumber',table_no,'delivery',request->'delivery','customerPhone',request->>'customerPhone','customer',left(coalesce(request->>'customer',''),500),'items',items,'note',left(coalesce(request->>'note',''),1000),'discount',0,'fee',CASE WHEN request->>'type'='Delivery' AND request->'delivery'->'chargeDeliveryFee'='true'::jsonb THEN coalesce((snapshot->'settings'->>'deliveryFee')::numeric,0) ELSE 0 END,'serviceFee',service>0,'serviceAmount',service,'payments','[]'::jsonb,'status',CASE WHEN marmita_only THEN 'pronto' ELSE 'cozinha' END,'createdAt',floor(extract(epoch FROM clock_timestamp())*1000),'sellerId',auth.uid(),'sellerName',actor,'source',CASE WHEN request->>'source'='mobile' THEN 'mobile' WHEN request->>'source'='catalog' THEN 'catalog' ELSE 'desktop' END);
 snapshot=jsonb_set(snapshot,'{products}',products);
 snapshot=jsonb_set(snapshot,'{orders}',jsonb_build_array(order_data)||(snapshot->'orders'));
 snapshot=jsonb_set(snapshot,'{nextNumber}',to_jsonb((snapshot->>'nextNumber')::integer+1));
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
 RETURN jsonb_build_object('number',order_data->'number','status',order_data->'status');
END $function$;

CREATE OR REPLACE FUNCTION public.submit_pdv_cashier_direct_paid(request jsonb, payment_method text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE result jsonb; snapshot jsonb; created jsonb; target_status text;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF nullif(trim(coalesce(payment_method,'')),'') IS NULL THEN RAISE EXCEPTION 'Selecione a forma de pagamento'; END IF;
 IF request->>'type' NOT IN ('Balcão','Mesa','Retirada','Delivery') OR request->>'type' IS NULL THEN RAISE EXCEPTION 'Tipo de venda inválido'; END IF;
 result=public.submit_pdv_cashier_paid(request,payment_method);
 PERFORM pg_advisory_xact_lock(742021);
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO created FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) value WHERE value->>'id'=request->>'id';
 IF created IS NULL THEN RAISE EXCEPTION 'Não foi possível localizar o pedido criado'; END IF;
 IF NOT (created->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(created->'payments','[]'::jsonb))>0) THEN RAISE EXCEPTION 'Pagamento não confirmado'; END IF;
 target_status=CASE WHEN request->>'type'='Delivery' THEN 'pronto' ELSE 'retirado' END;
 IF created->>'status'=target_status THEN RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','status',target_status,'directSale',true); END IF;
 IF created->>'status'<>'cozinha' THEN RAISE EXCEPTION 'Pedido não disponível para recebimento direto'; END IF;
 UPDATE public.pdv_state SET data=jsonb_set(snapshot,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=request->>'id' THEN value||jsonb_build_object('status',target_status) ELSE value END) FROM jsonb_array_elements(snapshot->'orders') value)),revision=revision+1,updated_at=now() WHERE id=1;
 RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('id',request->>'id','status',target_status,'directSale',true);
END $function$;
REVOKE ALL ON FUNCTION public.submit_pdv_cashier_direct_paid(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_cashier_direct_paid(jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.read_courier_operations(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE can_manage boolean; own uuid; start_day date; end_day date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
 can_manage=public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier');
 IF NOT can_manage AND NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF NOT can_manage THEN SELECT id INTO own FROM public.delivery_couriers WHERE user_id=auth.uid() AND active; IF own IS NULL THEN RAISE EXCEPTION 'Vincule esta conta a um entregador ativo'; END IF; END IF;
 start_day=coalesce(p_from,(now() AT TIME ZONE 'America/Sao_Paulo')::date);
 end_day=coalesce(p_to,start_day);
 IF end_day<start_day OR end_day-start_day>62 THEN RAISE EXCEPTION 'Selecione um período válido de até 62 dias'; END IF;
 RETURN jsonb_build_object(
  'base',(SELECT to_jsonb(s) FROM public.delivery_operation_settings s WHERE s.id=1),
  'current_courier_id',own,
  'locations',coalesce((SELECT jsonb_agg(jsonb_build_object('courier_id',c.id,'name',c.name,'latitude',l.latitude,'longitude',l.longitude,'accuracy_meters',l.accuracy_meters,'located_at',l.located_at,'consent_at',l.consent_at) ORDER BY c.name) FROM public.courier_locations l JOIN public.delivery_couriers c ON c.id=l.courier_id WHERE c.active AND (can_manage OR c.id=own)),'[]'::jsonb),
  'time_entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'courier_id',t.courier_id,'courier_name',c.name,'shift_date',t.shift_date,'shift_code',t.shift_code,'scheduled_start',t.scheduled_start,'scheduled_end',t.scheduled_end,'entry_at',t.entry_at,'exit_at',t.exit_at,'amount',t.amount) ORDER BY t.entry_at DESC) FROM public.courier_time_entries t JOIN public.delivery_couriers c ON c.id=t.courier_id WHERE (can_manage OR t.courier_id=own) AND (t.shift_date BETWEEN start_day AND end_day OR t.exit_at IS NULL)),'[]'::jsonb)
 );
END $function$;

CREATE OR REPLACE FUNCTION public.save_delivery_courier(courier_id uuid DEFAULT NULL::uuid, courier_name text DEFAULT ''::text, courier_phone text DEFAULT ''::text, account_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE cid uuid;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF trim(courier_name)='' OR length(courier_name)>120 THEN RAISE EXCEPTION 'Informe o nome'; END IF;
 IF account_id IS NOT NULL AND NOT public.has_role(account_id,'courier') THEN RAISE EXCEPTION 'Libere esta conta como Entregador na equipe'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 cid=coalesce(courier_id,gen_random_uuid());
 INSERT INTO public.delivery_couriers(id,name,phone,user_id) VALUES(cid,trim(courier_name),left(courier_phone,25),account_id) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,user_id=EXCLUDED.user_id;
 RETURN cid;
END $function$;

CREATE OR REPLACE FUNCTION public.set_courier_marmita_stock(p_courier_id uuid,p_quantity integer,p_mode text DEFAULT 'load')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE previous public.courier_marmita_stock; reserved integer; next_initial integer;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Somente o administrador ou o caixa pode registrar a carga'; END IF;
 IF p_quantity IS NULL OR p_quantity<0 OR p_quantity>999 OR p_mode NOT IN ('load','correct') THEN RAISE EXCEPTION 'Informe uma quantidade válida entre 0 e 999'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=p_courier_id AND active) THEN RAISE EXCEPTION 'Entregador indisponível'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0)::integer INTO reserved
 FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id
 WHERE d.status NOT IN ('Entregue','Cancelado') AND coalesce(r.courier_id,d.assigned_courier_id)=p_courier_id;
 IF p_mode='load' AND reserved>0 THEN RAISE EXCEPTION 'Este entregador tem % marmita(s) reservada(s). Conclua as entregas ou use Corrigir saldo.',reserved; END IF;
 SELECT * INTO previous FROM public.courier_marmita_stock WHERE courier_id=p_courier_id FOR UPDATE;
 next_initial=CASE WHEN p_mode='load' OR previous.courier_id IS NULL THEN p_quantity ELSE greatest(p_quantity,previous.initial_quantity+p_quantity-previous.remaining_quantity) END;
 INSERT INTO public.courier_marmita_stock(courier_id,initial_quantity,remaining_quantity,updated_by)
 VALUES(p_courier_id,next_initial,p_quantity,auth.uid())
 ON CONFLICT(courier_id) DO UPDATE SET initial_quantity=EXCLUDED.initial_quantity,remaining_quantity=EXCLUDED.remaining_quantity,updated_at=now(),updated_by=auth.uid();
 INSERT INTO public.courier_marmita_movements(courier_id,quantity_change,resulting_quantity,kind,actor_id)
 VALUES(p_courier_id,p_quantity-coalesce(previous.remaining_quantity,0),p_quantity,p_mode,auth.uid());
END;
$function$;
REVOKE ALL ON FUNCTION public.set_courier_marmita_stock(uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_courier_marmita_stock(uuid,integer,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.list_delivery_courier_accounts()
RETURNS TABLE(id uuid,name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 RETURN QUERY SELECT p.id,p.display_name FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id AND r.role='courier' ORDER BY p.display_name;
END $function$;
REVOKE ALL ON FUNCTION public.list_delivery_courier_accounts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_delivery_courier_accounts() TO authenticated;