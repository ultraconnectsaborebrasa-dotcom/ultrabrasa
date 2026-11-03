
-- 1) Receber pagamento: admin+caixa, sem duplicar, sem mudar a etapa operacional
CREATE OR REPLACE FUNCTION public.pay_pdv_cashier(order_id text, payment_method text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE snapshot jsonb; target jsonb; total numeric; methods jsonb; updated jsonb;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
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
END $function$;

-- 2) Etapa operacional única: aberta → cozinha → pronto → entrega/retirado → entregue
CREATE OR REPLACE FUNCTION public.advance_pdv_cashier_order(order_id text, new_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE snapshot jsonb; target jsonb; current text;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF new_status NOT IN ('cozinha','pronto','entrega','entregue','retirado') THEN RAISE EXCEPTION 'Status inválido'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT o INTO target FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'id'=order_id;
 IF target IS NULL THEN RAISE EXCEPTION 'Comanda não encontrada'; END IF;
 current=target->>'status';
 IF current='cancelado' THEN RAISE EXCEPTION 'Pedido cancelado'; END IF;
 IF current IN ('entregue','retirado','pago') THEN RAISE EXCEPTION 'Pedido já finalizado'; END IF;
 IF new_status='cozinha' AND current<>'aberta' THEN RAISE EXCEPTION 'Somente comandas novas podem ir à cozinha'; END IF;
 IF new_status='pronto' AND current<>'cozinha' THEN RAISE EXCEPTION 'Envie a comanda à cozinha antes'; END IF;
 IF new_status='entrega' AND NOT (current='pronto' AND target->>'type'='Delivery') THEN RAISE EXCEPTION 'Somente pedidos prontos de delivery podem sair para entrega'; END IF;
 IF new_status='retirado' AND NOT (current='pronto' AND target->>'type'<>'Delivery') THEN RAISE EXCEPTION 'Somente pedidos prontos de balcão, mesa ou retirada podem ser retirados'; END IF;
 IF new_status='entregue' AND current<>'entrega' THEN RAISE EXCEPTION 'Registre a saída para entrega antes'; END IF;
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN o->>'id'=order_id THEN o||jsonb_build_object('status',new_status) ELSE o END)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') o;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
END $function$;

-- 3) Saída para entrega também move a etapa do pedido no PDV
CREATE OR REPLACE FUNCTION public.depart_delivery(_order text, _courier uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d public.delivery_orders; o jsonb; s jsonb;
BEGIN
IF NOT public.delivery_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
PERFORM pg_advisory_xact_lock(742021);
SELECT * INTO d FROM public.delivery_orders WHERE order_id=_order FOR UPDATE;
SELECT data INTO s FROM public.pdv_state WHERE id=1 FOR UPDATE;
SELECT value INTO o FROM jsonb_array_elements(s->'orders') WHERE value->>'id'=_order;
IF d.id IS NULL OR d.status IN ('Entregue','Cancelado') OR o->>'status'='cancelado' THEN RAISE EXCEPTION 'Entrega encerrada ou inexistente'; END IF;
IF o->>'status' NOT IN ('cozinha','pronto','pago','entrega') THEN RAISE EXCEPTION 'Aceite o pedido antes da saída'; END IF;
IF _courier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=_courier AND active) THEN RAISE EXCEPTION 'Entregador inválido'; END IF;
IF d.status<>'Em rota' THEN
 UPDATE public.delivery_orders SET status='Em rota',departed_at=coalesce(departed_at,now()),assigned_courier_id=_courier WHERE id=d.id;
END IF;
IF o->>'status' IN ('cozinha','pronto','pago') THEN
 UPDATE public.pdv_state SET data=jsonb_set(s,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=_order THEN value||jsonb_build_object('status','entrega')||CASE WHEN value->>'status'='pago' AND value->>'paymentStatus' IS NULL THEN jsonb_build_object('paymentStatus','pago') ELSE '{}'::jsonb END ELSE value END) FROM jsonb_array_elements(s->'orders'))),revision=revision+1,updated_at=now() WHERE id=1;
END IF;
END $function$;

-- 4) Baixa de entrega também finaliza a etapa do pedido no PDV
CREATE OR REPLACE FUNCTION public.update_delivery_status(delivery_id uuid, new_status text, issue text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d public.delivery_orders; BEGIN
PERFORM pg_advisory_xact_lock(742021); SELECT * INTO d FROM public.delivery_orders WHERE id=delivery_id FOR UPDATE;
IF d.id IS NULL OR (NOT public.delivery_staff() AND NOT (public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_routes r JOIN public.delivery_couriers c ON c.id=r.courier_id WHERE r.id=d.route_id AND c.user_id=auth.uid() AND c.active))) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
IF d.status IN ('Entregue','Cancelado') THEN RAISE EXCEPTION 'Entrega encerrada'; END IF;
IF issue IS NOT NULL THEN IF trim(issue)='' THEN RAISE EXCEPTION 'Descreva o problema'; END IF; UPDATE public.delivery_orders SET problem=left(issue,1000) WHERE id=d.id; RETURN; END IF;
IF new_status IS DISTINCT FROM 'Entregue' THEN RAISE EXCEPTION 'Status inválido'; END IF;
UPDATE public.delivery_orders SET status='Entregue',delivered_at=now() WHERE id=d.id;
UPDATE public.pdv_state SET data=jsonb_set(data,'{orders}',(SELECT jsonb_agg(CASE WHEN value->>'id'=d.order_id AND value->>'status' IN ('entrega','pronto','cozinha') THEN value||jsonb_build_object('status','entregue') ELSE value END) FROM jsonb_array_elements(data->'orders'))),revision=revision+1,updated_at=now() WHERE id=1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(data->'orders') v WHERE v->>'id'=d.order_id AND v->>'status' IN ('entrega','pronto','cozinha'));
END $function$;

-- 5) Leitura do caixa: admin também, inclui Em entrega e Finalizados de hoje
CREATE OR REPLACE FUNCTION public.read_pdv_cashier()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE snapshot jsonb; day_start bigint;
BEGIN
 IF NOT (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 day_start=floor(extract(epoch FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date)*1000);
 RETURN jsonb_build_object(
 'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','category',p->>'category','price',p->'price','stock',p->'stock','active',p->'active')) FROM jsonb_array_elements(coalesce(snapshot->'products','[]')) p),'[]'),
 'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o->>'id','number',o->'number','type',o->>'type','tableNumber',o->'tableNumber','customer',o->>'customer','customerPhone',o->>'customerPhone','status',o->>'status','paymentStatus',o->>'paymentStatus','hasPayment',jsonb_array_length(coalesce(o->'payments','[]'))>0,'createdAt',o->'createdAt','note',o->>'note','total',greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(o->'items') i)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,0)),'items',(SELECT jsonb_agg(jsonb_build_object('name',i->>'name','qty',i->'qty','price',i->'price','note',i->'note')) FROM jsonb_array_elements(o->'items') i)) ORDER BY (o->>'createdAt')::bigint) FROM jsonb_array_elements(coalesce(snapshot->'orders','[]')) o WHERE o->>'status' IN ('aberta','cozinha','pronto','entrega') OR (o->>'status' IN ('entregue','retirado','pago') AND coalesce((o->>'paidAt')::bigint,(o->>'createdAt')::bigint)>=day_start)),'[]'),
 'deliveryFee',coalesce((snapshot->'settings'->>'deliveryFee')::numeric,0),'paymentMethods',coalesce(snapshot->'settings'->'paymentMethods','[]'));
END $function$;
