CREATE TABLE public.delivery_operational_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 delivery_id uuid NOT NULL REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
 courier_id uuid REFERENCES public.delivery_couriers(id) ON DELETE SET NULL,
 event text NOT NULL,
 from_courier_id uuid REFERENCES public.delivery_couriers(id) ON DELETE SET NULL,
 to_courier_id uuid REFERENCES public.delivery_couriers(id) ON DELETE SET NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 actor_id uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_operational_events TO authenticated;
GRANT ALL ON public.delivery_operational_events TO service_role;
ALTER TABLE public.delivery_operational_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read delivery events" ON public.delivery_operational_events FOR SELECT TO authenticated
 USING(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));
CREATE POLICY "Courier reads own delivery events" ON public.delivery_operational_events FOR SELECT TO authenticated
 USING(public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_couriers c WHERE c.user_id=auth.uid() AND c.active AND c.id IN (courier_id,from_courier_id,to_courier_id)));
CREATE INDEX delivery_operational_events_courier_idx ON public.delivery_operational_events(courier_id,created_at DESC);
CREATE INDEX delivery_operational_events_delivery_idx ON public.delivery_operational_events(delivery_id,created_at DESC);
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS arrived_at timestamptz;

CREATE OR REPLACE FUNCTION public.assert_courier_marmita_stock(p_courier_id uuid,p_delivery_ids uuid[],p_exclude_route_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE required integer; reserved integer; stock_row public.courier_marmita_stock; snapshot jsonb; courier_status text;
BEGIN
 SELECT operational_status INTO courier_status FROM public.delivery_couriers WHERE id=p_courier_id AND active FOR UPDATE;
 IF courier_status IS NULL THEN RAISE EXCEPTION 'Entregador indisponível'; END IF;
 IF courier_status<>'available' THEN RAISE EXCEPTION 'Este entregador não está disponível para novas atribuições'; END IF;
 SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0)::integer INTO required FROM public.delivery_orders d WHERE d.id=ANY(p_delivery_ids);
 IF required=0 THEN RETURN; END IF;
 SELECT * INTO stock_row FROM public.courier_marmita_stock WHERE courier_id=p_courier_id FOR UPDATE;
 IF stock_row.courier_id IS NULL THEN RAISE EXCEPTION 'Registre a carga de marmitas deste entregador antes de designar'; END IF;
 SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0)::integer INTO reserved
 FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id
 WHERE d.status NOT IN ('Entregue','Cancelado') AND coalesce(r.courier_id,d.assigned_courier_id)=p_courier_id
 AND (p_exclude_route_id IS NULL OR d.route_id IS DISTINCT FROM p_exclude_route_id);
 IF required>stock_row.remaining_quantity-reserved THEN RAISE EXCEPTION 'Marmitas insuficientes: % disponível(is) e % necessária(s)',greatest(0,stock_row.remaining_quantity-reserved),required; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 IF EXISTS(
  SELECT 1 FROM public.delivery_orders d
  JOIN LATERAL(SELECT value FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) WHERE value->>'id'=d.order_id) orders ON true
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(orders.value->'items','[]'::jsonb)) item
  WHERE d.id=ANY(p_delivery_ids) AND position('marmita' in lower(coalesce(item.value->>'name','')))>0
  AND NOT(CASE WHEN item.value->>'productId' IS NOT NULL THEN item.value->>'productId'=stock_row.product_id ELSE lower(trim(item.value->>'name'))=lower(trim(stock_row.product_name)) END)
 ) THEN RAISE EXCEPTION 'A carga atual de % não é compatível com todas as marmitas selecionadas',stock_row.product_name; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_courier_marmita_stock(uuid,uuid[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_courier_marmita_stock(uuid,uuid[],uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.save_delivery_route(route_id uuid DEFAULT NULL,route_name text DEFAULT '',courier uuid DEFAULT NULL,origin_address text DEFAULT '',stops uuid[] DEFAULT '{}')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE rid uuid; cnt integer;
BEGIN
 IF NOT public.delivery_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 IF array_length(stops,1) IS NULL OR array_length(stops,1)>100 OR trim(route_name)='' THEN RAISE EXCEPTION 'Selecione pedidos e nomeie a rota'; END IF;
 IF route_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_routes r JOIN public.delivery_orders d ON d.route_id=r.id WHERE r.id=save_delivery_route.route_id AND d.status NOT IN ('Entregue','Cancelado')) THEN RAISE EXCEPTION 'Rota encerrada'; END IF;
 IF route_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.delivery_orders d WHERE d.route_id=save_delivery_route.route_id AND d.status NOT IN ('Aguardando preparo','Pronto para entrega')) THEN RAISE EXCEPTION 'Rota já iniciada ou encerrada'; END IF;
 PERFORM 1 FROM public.delivery_orders WHERE id=ANY(stops) FOR UPDATE;
 SELECT count(*) INTO cnt FROM public.delivery_orders d WHERE id=ANY(stops) AND status IN ('Aguardando preparo','Pronto para entrega') AND (d.route_id IS NULL OR d.route_id=save_delivery_route.route_id);
 IF cnt<>cardinality(stops) THEN RAISE EXCEPTION 'Pedido indisponível ou já atribuído a outra rota'; END IF;
 PERFORM public.validate_delivery_input(jsonb_build_object('address',d.address)) FROM public.delivery_orders d WHERE d.id=ANY(stops);
 IF courier IS NOT NULL THEN PERFORM public.assert_courier_marmita_stock(courier,stops,route_id); END IF;
 rid=coalesce(route_id,gen_random_uuid());
 INSERT INTO public.delivery_routes(id,name,courier_id,origin,created_by) VALUES(rid,left(route_name,120),courier,left(coalesce(origin_address,''),500),auth.uid())
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,courier_id=EXCLUDED.courier_id,origin=EXCLUDED.origin;
 UPDATE public.delivery_orders SET route_id=NULL,position=0,assigned_courier_id=NULL WHERE route_id=rid;
 UPDATE public.delivery_orders d SET route_id=rid,position=s.ordinality,assigned_courier_id=courier FROM unnest(stops) WITH ORDINALITY s(id,ordinality) WHERE d.id=s.id;
 IF courier IS NOT NULL THEN
  INSERT INTO public.delivery_operational_events(delivery_id,courier_id,event,to_courier_id,details,actor_id)
  SELECT d.id,courier,'assigned',courier,jsonb_build_object('route_id',rid),auth.uid() FROM public.delivery_orders d WHERE d.id=ANY(stops);
 END IF;
 RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.depart_delivery(_order text,_courier uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE d public.delivery_orders; o jsonb; s jsonb; rid uuid; route_courier uuid; target_courier uuid; next_position integer; origin text;
BEGIN
 IF NOT public.delivery_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 SELECT * INTO d FROM public.delivery_orders WHERE order_id=_order FOR UPDATE;
 SELECT data INTO s FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT value INTO o FROM jsonb_array_elements(s->'orders') WHERE value->>'id'=_order;
 IF d.id IS NULL OR d.status IN ('Entregue','Cancelado') OR o->>'status'='cancelado' THEN RAISE EXCEPTION 'Entrega encerrada ou inexistente'; END IF;
 IF o->>'status' NOT IN ('cozinha','pronto','pago','entrega') THEN RAISE EXCEPTION 'Aceite o pedido antes da saída'; END IF;
 IF _courier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=_courier AND active) THEN RAISE EXCEPTION 'Entregador inválido'; END IF;
 IF d.route_id IS NOT NULL THEN
  SELECT courier_id INTO route_courier FROM public.delivery_routes WHERE id=d.route_id FOR UPDATE;
  IF _courier IS NOT NULL AND route_courier IS NOT NULL AND route_courier<>_courier THEN RAISE EXCEPTION 'Este pedido já pertence a uma rota de outro entregador. Use Transferir entrega.'; END IF;
  target_courier=coalesce(_courier,route_courier,d.assigned_courier_id);
  IF _courier IS NOT NULL AND route_courier IS NULL THEN UPDATE public.delivery_routes SET courier_id=_courier WHERE id=d.route_id; END IF;
 ELSE
  target_courier=coalesce(_courier,d.assigned_courier_id);
 END IF;
 IF target_courier IS NOT NULL THEN PERFORM public.assert_courier_marmita_stock(target_courier,ARRAY[d.id],NULL); END IF;
 IF d.route_id IS NULL AND target_courier IS NOT NULL THEN
  SELECT r.id INTO rid FROM public.delivery_routes r WHERE r.courier_id=target_courier AND EXISTS(SELECT 1 FROM public.delivery_orders active WHERE active.route_id=r.id AND active.status='Em rota') ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE;
  IF rid IS NULL THEN
   rid=gen_random_uuid(); SELECT base_address INTO origin FROM public.delivery_operation_settings WHERE id=1;
   INSERT INTO public.delivery_routes(id,name,courier_id,origin,created_by) VALUES(rid,left('Pedido #'||coalesce(o->>'number',_order)||' · '||d.customer,120),target_courier,left(coalesce(origin,''),500),auth.uid()); next_position=1;
  ELSE SELECT coalesce(max(position),0)+1 INTO next_position FROM public.delivery_orders WHERE route_id=rid; END IF;
 END IF;
 UPDATE public.delivery_orders SET status='Em rota',departed_at=coalesce(departed_at,now()),assigned_courier_id=target_courier,route_id=coalesce(rid,route_id),position=CASE WHEN rid IS NOT NULL THEN next_position ELSE position END WHERE id=d.id;
 INSERT INTO public.delivery_operational_events(delivery_id,courier_id,event,to_courier_id,details,actor_id) VALUES(d.id,target_courier,'departed',target_courier,jsonb_build_object('route_id',coalesce(rid,d.route_id)),auth.uid());
 IF o->>'status' IN ('cozinha','pronto','pago') THEN
  UPDATE public.pdv_state SET data=jsonb_set(s,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=_order THEN value||jsonb_build_object('status','entrega')||CASE WHEN value->>'status'='pago' AND value->>'paymentStatus' IS NULL THEN jsonb_build_object('paymentStatus','pago') ELSE '{}'::jsonb END ELSE value END) FROM jsonb_array_elements(s->'orders'))),revision=revision+1,updated_at=now() WHERE id=1;
 END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_delivery(delivery_id uuid,new_courier_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE d public.delivery_orders; old_route public.delivery_routes; old_courier uuid; rid uuid; origin text; open_stops integer;
BEGIN
 IF NOT public.delivery_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 SELECT * INTO d FROM public.delivery_orders WHERE id=transfer_delivery.delivery_id FOR UPDATE;
 IF d.id IS NULL OR d.status IN ('Entregue','Cancelado') THEN RAISE EXCEPTION 'Entrega encerrada ou inexistente'; END IF;
 SELECT * INTO old_route FROM public.delivery_routes WHERE id=d.route_id FOR UPDATE;
 old_courier=coalesce(old_route.courier_id,d.assigned_courier_id);
 IF old_courier=new_courier_id THEN RAISE EXCEPTION 'Esta entrega já está com o entregador escolhido'; END IF;
 PERFORM public.assert_courier_marmita_stock(new_courier_id,ARRAY[d.id],NULL);
 IF old_route.id IS NOT NULL THEN
  SELECT count(*) INTO open_stops FROM public.delivery_orders WHERE route_id=old_route.id AND status NOT IN ('Entregue','Cancelado');
  IF open_stops=1 THEN rid=old_route.id; UPDATE public.delivery_routes SET courier_id=new_courier_id WHERE id=rid; END IF;
 END IF;
 IF rid IS NULL THEN
  rid=gen_random_uuid(); origin=coalesce(old_route.origin,(SELECT base_address FROM public.delivery_operation_settings WHERE id=1),'');
  INSERT INTO public.delivery_routes(id,name,courier_id,origin,created_by) VALUES(rid,left('Transferência · Pedido '||d.order_id,120),new_courier_id,left(origin,500),auth.uid());
 END IF;
 UPDATE public.delivery_orders SET route_id=rid,assigned_courier_id=new_courier_id,position=CASE WHEN rid=old_route.id THEN position ELSE 1 END WHERE id=d.id;
 INSERT INTO public.delivery_operational_events(delivery_id,courier_id,event,from_courier_id,to_courier_id,details,actor_id) VALUES(d.id,new_courier_id,'transfer',old_courier,new_courier_id,jsonb_build_object('old_route_id',d.route_id,'new_route_id',rid),auth.uid());
 RETURN rid;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_delivery(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_delivery(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_delivery_courier_availability(p_courier_id uuid,p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF p_status NOT IN ('available','unavailable','returning') THEN RAISE EXCEPTION 'Disponibilidade inválida'; END IF;
 UPDATE public.delivery_couriers SET operational_status=p_status,status_updated_at=now() WHERE id=p_courier_id AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Entregador indisponível'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_delivery_courier_availability(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_delivery_courier_availability(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.mark_courier_arrival(delivery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE d public.delivery_orders; own uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(742021);
 SELECT * INTO d FROM public.delivery_orders WHERE id=mark_courier_arrival.delivery_id FOR UPDATE;
 IF d.id IS NULL OR d.status NOT IN ('Pronto para entrega','Em rota') THEN RAISE EXCEPTION 'Entrega indisponível para confirmar chegada'; END IF;
 IF NOT public.delivery_staff() THEN
  SELECT c.id INTO own FROM public.delivery_routes r JOIN public.delivery_couriers c ON c.id=r.courier_id WHERE r.id=d.route_id AND c.user_id=auth.uid() AND c.active;
  IF own IS NULL THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 END IF;
 UPDATE public.delivery_orders SET arrived_at=coalesce(arrived_at,now()) WHERE id=d.id;
 INSERT INTO public.delivery_operational_events(delivery_id,courier_id,event,to_courier_id,details,actor_id) VALUES(d.id,coalesce((SELECT courier_id FROM public.delivery_routes WHERE id=d.route_id),d.assigned_courier_id),'arrival',coalesce((SELECT courier_id FROM public.delivery_routes WHERE id=d.route_id),d.assigned_courier_id),jsonb_build_object('arrived_at',now()),auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.mark_courier_arrival(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_courier_arrival(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.deduct_courier_marmita_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE own uuid; route_courier uuid; quantity integer; movement_id uuid; stock_row public.courier_marmita_stock;
BEGIN
 SELECT courier_id INTO route_courier FROM public.delivery_routes WHERE id=NEW.route_id;
 own=coalesce(route_courier,NEW.assigned_courier_id);
 IF own IS NULL THEN RETURN NEW; END IF;
 quantity=public.delivery_marmita_quantity(NEW.order_id);
 IF quantity<=0 THEN RETURN NEW; END IF;
 SELECT * INTO stock_row FROM public.courier_marmita_stock WHERE courier_id=own FOR UPDATE;
 IF stock_row.courier_id IS NULL THEN RETURN NEW; END IF;
 IF stock_row.remaining_quantity<quantity THEN RAISE EXCEPTION 'Estoque físico insuficiente para concluir esta entrega'; END IF;
 INSERT INTO public.courier_marmita_movements(courier_id,delivery_id,quantity_change,resulting_quantity,kind,actor_id,journey_id,load_id,product_id)
 VALUES(own,NEW.id,-quantity,stock_row.remaining_quantity-quantity,'delivery',auth.uid(),stock_row.journey_id,stock_row.current_load_id,stock_row.product_id)
 ON CONFLICT(delivery_id) DO NOTHING RETURNING id INTO movement_id;
 IF movement_id IS NULL THEN RETURN NEW; END IF;
 UPDATE public.courier_marmita_stock SET remaining_quantity=remaining_quantity-quantity,journey_status=CASE WHEN remaining_quantity-quantity=0 THEN 'empty' ELSE journey_status END,updated_at=now(),updated_by=auth.uid() WHERE courier_id=own;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_pdv_cashier(order_id text,payment_method text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE snapshot jsonb; target jsonb; total numeric; methods jsonb; updated jsonb; own_payment boolean;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN
  SELECT EXISTS(SELECT 1 FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id JOIN public.delivery_couriers c ON c.id=coalesce(r.courier_id,d.assigned_courier_id) WHERE d.order_id=pay_pdv_cashier.order_id AND c.user_id=auth.uid() AND c.active AND d.status NOT IN ('Entregue','Cancelado')) INTO own_payment;
  IF NOT own_payment THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT o INTO target FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'id'=order_id;
 IF target IS NULL THEN RAISE EXCEPTION 'Comanda não encontrada'; END IF;
 IF target->>'status'='cancelado' THEN RAISE EXCEPTION 'Pedido cancelado não pode receber pagamento'; END IF;
 IF target->>'status'='pago' OR target->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(target->'payments','[]'::jsonb))>0 THEN RAISE EXCEPTION 'Pagamento já registrado para este pedido'; END IF;
 IF target->>'status' NOT IN ('aberta','cozinha','pronto','entrega','entregue','retirado') THEN RAISE EXCEPTION 'Comanda não disponível para pagamento'; END IF;
 methods=coalesce(snapshot->'settings'->'paymentMethods','[]'::jsonb);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(methods) m WHERE m=payment_method) THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;
 total=greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(target->'items') i)-coalesce((target->>'discount')::numeric,0)+coalesce((target->>'fee')::numeric,0)+coalesce((target->>'serviceAmount')::numeric,0));
 updated=target||jsonb_build_object('paymentStatus','pago','paidAt',floor(extract(epoch FROM clock_timestamp())*1000),'payments',jsonb_build_array(jsonb_build_object('method',payment_method,'amount',total)),'cashierId',auth.uid()::text);
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN o->>'id'=order_id THEN updated ELSE o END)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') o;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_delivery_board()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE snapshot jsonb; is_admin boolean; result jsonb;
BEGIN
 is_admin=public.has_role(auth.uid(),'admin');
 IF NOT public.delivery_staff() AND NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 SELECT coalesce(jsonb_agg((CASE WHEN is_admin OR d.status NOT IN ('Entregue','Cancelado') THEN to_jsonb(d) ELSE to_jsonb(d)-'cash_for'-'payment_method' END)||jsonb_build_object('number',o->'number','items',(SELECT coalesce(jsonb_agg(jsonb_build_object('productId',i->>'productId','name',i->>'name','qty',i->'qty','note',i->>'note')),'[]') FROM jsonb_array_elements(coalesce(o->'items','[]')) i),'courier_id',coalesce(r.courier_id,d.assigned_courier_id),'order_status',o->>'status','payment_status',CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(o->'payments','[]')) p WHERE p->>'verification'='unverified') THEN 'Pago — conferir comprovante' WHEN jsonb_array_length(coalesce(o->'payments','[]'))>0 THEN 'Pago' ELSE 'Pendente' END,'total',CASE WHEN is_admin OR d.status NOT IN ('Entregue','Cancelado') THEN t.total END,'due',CASE WHEN is_admin OR d.status NOT IN ('Entregue','Cancelado') THEN greatest(0,t.total-coalesce((SELECT sum((p->>'amount')::numeric) FROM jsonb_array_elements(coalesce(o->'payments','[]')) p),0)) END,'change',CASE WHEN is_admin OR d.status NOT IN ('Entregue','Cancelado') THEN greatest(0,d.cash_for-t.total) END) ORDER BY d.created_at DESC),'[]') INTO result
 FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id LEFT JOIN LATERAL(SELECT value o FROM jsonb_array_elements(snapshot->'orders') WHERE value->>'id'=d.order_id) orders ON true
 LEFT JOIN LATERAL(SELECT greatest(0,coalesce((SELECT sum((i->>'qty')::numeric*(i->>'price')::numeric) FROM jsonb_array_elements(coalesce(o->'items','[]')) i),0)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,0)) total) t ON true
 WHERE is_admin OR public.delivery_staff() OR (public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_couriers c WHERE c.id=r.courier_id AND c.user_id=auth.uid() AND c.active));
 RETURN jsonb_build_object(
 'deliveries',result,
 'routes',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.delivery_routes r WHERE is_admin OR (public.delivery_staff() AND EXISTS(SELECT 1 FROM public.delivery_orders d WHERE d.route_id=r.id AND d.status NOT IN ('Entregue','Cancelado'))) OR (public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_couriers c WHERE c.id=r.courier_id AND c.user_id=auth.uid() AND c.active))),'[]'),
 'couriers',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('initial_quantity',s.initial_quantity,'remaining_quantity',s.remaining_quantity,'reserved_quantity',a.reserved,'available_quantity',CASE WHEN s.courier_id IS NULL THEN NULL ELSE s.remaining_quantity-a.reserved END,'stock_updated_at',s.updated_at,'product_id',s.product_id,'product_name',s.product_name,'journey_id',s.journey_id,'journey_status',s.journey_status)) FROM public.delivery_couriers c LEFT JOIN public.courier_marmita_stock s ON s.courier_id=c.id LEFT JOIN LATERAL(SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0)::integer reserved FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status NOT IN ('Entregue','Cancelado') AND coalesce(r.courier_id,d.assigned_courier_id)=c.id) a ON true WHERE public.delivery_staff() OR (public.has_role(auth.uid(),'courier') AND c.user_id=auth.uid() AND c.active)),'[]'),
 'marmita_products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name') ORDER BY p->>'name') FROM jsonb_array_elements(coalesce(snapshot->'products','[]'::jsonb)) p WHERE lower(trim(p->>'category'))='marmitas' AND coalesce(p->>'active','true')='true'),'[]')
 );
END;
$$;