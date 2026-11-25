CREATE OR REPLACE FUNCTION public.adjust_pdv_order_values(p_order text,p_discount numeric,p_extra numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; target jsonb; updated jsonb; sub numeric; base_fee numeric;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Sem permissão para ajustar valores'; END IF;
 IF p_discount IS NULL OR p_extra IS NULL OR p_discount::text IN ('NaN','Infinity','-Infinity') OR p_extra::text IN ('NaN','Infinity','-Infinity') OR p_discount<0 OR p_extra<0 THEN RAISE EXCEPTION 'Valores inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(742021); PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT o INTO target FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'id'=p_order;
 IF target IS NULL OR target->>'status' NOT IN ('aberta','cozinha','pronto','entrega','entregue','retirado') THEN RAISE EXCEPTION 'Pedido indisponível para ajuste'; END IF;
 IF target->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(target->'payments','[]'))>0 THEN RAISE EXCEPTION 'Pedido com pagamento não pode ter valores alterados'; END IF;
 SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) INTO sub FROM jsonb_array_elements(target->'items') i;
 IF round(p_discount,2)>sub THEN RAISE EXCEPTION 'Desconto maior que o subtotal'; END IF;
 base_fee=coalesce((target->>'fee')::numeric,0)-coalesce((target->>'extraFee')::numeric,0);
 updated=target||jsonb_build_object('discount',round(p_discount,2),'extraFee',round(p_extra,2),'fee',base_fee+round(p_extra,2));
 IF coalesce((target->>'discount')::numeric,0)<>round(p_discount,2) OR coalesce((target->>'extraFee')::numeric,0)<>round(p_extra,2) THEN
  updated=updated||jsonb_build_object('valueAdjustments',coalesce(target->'valueAdjustments','[]')||jsonb_build_array(jsonb_build_object('actor',auth.uid(),'at',floor(extract(epoch FROM clock_timestamp())*1000),'oldDiscount',target->'discount','oldExtra',target->'extraFee','discount',round(p_discount,2),'extra',round(p_extra,2))));
 END IF;
 UPDATE public.pdv_state SET data=jsonb_set(snapshot,'{orders}',(SELECT jsonb_agg(CASE WHEN o->>'id'=p_order THEN updated ELSE o END) FROM jsonb_array_elements(snapshot->'orders') o)),revision=revision+1,updated_at=now() WHERE id=1;
 RETURN jsonb_build_object('total',round(sub-round(p_discount,2)+base_fee+round(p_extra,2)+coalesce((target->>'serviceAmount')::numeric,0),2));
END $$;
REVOKE ALL ON FUNCTION public.adjust_pdv_order_values(text,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adjust_pdv_order_values(text,numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_pdv_cashier_adjusted(request jsonb,p_payment_method text DEFAULT NULL,p_direct boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; existing jsonb;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF p_direct AND nullif(p_payment_method,'') IS NULL THEN RAISE EXCEPTION 'Selecione o pagamento'; END IF;
 PERFORM pg_advisory_xact_lock(742021); PERFORM pg_advisory_xact_lock(742019);
 SELECT o INTO existing FROM jsonb_array_elements(coalesce((SELECT data FROM public.pdv_state WHERE id=1)->'orders','[]')) o WHERE o->>'id'=request->>'id';
 IF existing IS NOT NULL THEN
  IF existing->>'sellerId' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
  RETURN jsonb_build_object('id',existing->>'id','number',existing->'number','status',existing->>'status');
 END IF;
 result=public.submit_pdv_operator_with_contact(request);
 PERFORM public.adjust_pdv_order_values(request->>'id',coalesce((request->>'discount')::numeric,0),coalesce((request->>'extraFee')::numeric,0));
 IF p_direct THEN result=public.submit_pdv_cashier_direct_paid(request,p_payment_method);
 ELSIF nullif(p_payment_method,'') IS NOT NULL THEN result=public.submit_pdv_cashier_paid(request,p_payment_method); END IF;
 RETURN result||jsonb_build_object('id',request->>'id');
END $$;
REVOKE ALL ON FUNCTION public.submit_pdv_cashier_adjusted(jsonb,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_pdv_cashier_adjusted(jsonb,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.pay_pdv_adjusted(p_order text,p_method text,p_discount numeric,p_extra numeric,p_mark_ready boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.adjust_pdv_order_values(p_order,p_discount,p_extra);
 IF p_mark_ready THEN PERFORM public.pay_pdv_kitchen(p_order,p_method); ELSE PERFORM public.pay_pdv_cashier(p_order,p_method); END IF;
END $$;
REVOKE ALL ON FUNCTION public.pay_pdv_adjusted(text,text,numeric,numeric,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pay_pdv_adjusted(text,text,numeric,numeric,boolean) TO authenticated;

DO $patch$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.pay_pdv_cashier(text,text)'::regprocedure) INTO def;
 def=replace(def,'PERFORM pg_advisory_xact_lock(742019);','PERFORM pg_advisory_xact_lock(742021); PERFORM pg_advisory_xact_lock(742019);');
 IF position('''method'',payment_method,''amount'',total' IN def)=0 THEN RAISE EXCEPTION 'Definição de pagamento mudou'; END IF;
 def=replace(def,'''method'',payment_method,''amount'',total','''method'',payment_method,''amount'',total,''courierId'',(SELECT c.id FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id JOIN public.delivery_couriers c ON c.id=coalesce(r.courier_id,d.assigned_courier_id) WHERE d.order_id=pay_pdv_cashier.order_id AND c.user_id=auth.uid() AND c.active AND d.status NOT IN (''Entregue'',''Cancelado'') LIMIT 1)');
 EXECUTE def;
 SELECT pg_get_functiondef('public.read_pdv_cashier()'::regprocedure) INTO def;
 IF position('''discount'',coalesce(o->>''discount'',''0'')::numeric' IN def)=0 THEN RAISE EXCEPTION 'Leitura de caixa mudou'; END IF;
 def=replace(def,'''discount'',coalesce(o->>''discount'',''0'')::numeric','''extraFee'',coalesce(o->>''extraFee'',''0'')::numeric,''discount'',coalesce(o->>''discount'',''0'')::numeric');
 EXECUTE def;
END $patch$;

CREATE OR REPLACE FUNCTION public.read_courier_settlement(p_day date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; is_admin boolean; staff boolean; result jsonb;
BEGIN
 is_admin=public.has_role(auth.uid(),'admin'); staff=is_admin OR public.has_role(auth.uid(),'cashier');
 IF NOT staff AND NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF p_day IS NULL OR (NOT is_admin AND p_day<>(now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN RAISE EXCEPTION 'Consulta limitada ao dia atual'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 WITH orders AS (
 SELECT d.*,o,r.courier_id route_courier FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id JOIN LATERAL (SELECT value o FROM jsonb_array_elements(coalesce(snapshot->'orders','[]')) value WHERE value->>'id'=d.order_id) x ON true
 ), entries AS (
 SELECT d.order_id,(d.o->>'number')::integer number,d.customer,d.status,coalesce(nullif(p->>'courierId','')::uuid,d.route_courier,d.assigned_courier_id) courier_id,
 CASE WHEN p->>'verification'='unverified' THEN 'unverified' WHEN nullif(p->>'courierId','') IS NOT NULL AND p->>'method'='Dinheiro' THEN 'cash' WHEN nullif(p->>'courierId','') IS NOT NULL AND p->>'method' IN ('Crédito','Débito','Cartão','Vale-refeição') THEN 'card' WHEN d.departed_at IS NOT NULL AND to_timestamp((d.o->>'paidAt')::numeric/1000)<=d.departed_at THEN 'prepaid' ELSE 'store' END category,
 (p->>'amount')::numeric amount,p->>'method' method,(d.o->>'paidAt')::bigint paid_at
 FROM orders d CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.o->'payments','[]')) p
 WHERE (to_timestamp(coalesce((d.o->>'paidAt')::numeric,(d.o->>'createdAt')::numeric)/1000) AT TIME ZONE 'America/Sao_Paulo')::date=p_day
 UNION ALL
 SELECT d.order_id,(d.o->>'number')::integer,d.customer,d.status,coalesce(d.route_courier,d.assigned_courier_id),'pending',greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(d.o->'items') i)-coalesce((d.o->>'discount')::numeric,0)+coalesce((d.o->>'fee')::numeric,0)+coalesce((d.o->>'serviceAmount')::numeric,0)),d.payment_method,NULL::bigint
 FROM orders d WHERE jsonb_array_length(coalesce(d.o->'payments','[]'))=0 AND d.status<>'Cancelado' AND (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date=p_day
 )
 SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('courier_name',c.name) ORDER BY c.name,e.number),'[]') INTO result FROM entries e JOIN public.delivery_couriers c ON c.id=e.courier_id WHERE staff OR (c.user_id=auth.uid() AND c.active);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_courier_settlement(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_courier_settlement(date) TO authenticated;