CREATE OR REPLACE FUNCTION public.read_courier_settlement(p_day date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
 CASE WHEN p->>'verification'='unverified' THEN 'unverified'
  WHEN (nullif(p->>'courierId','') IS NOT NULL OR (d.departed_at IS NOT NULL AND to_timestamp((d.o->>'paidAt')::numeric/1000)>d.departed_at)) AND p->>'method'='Dinheiro' THEN 'cash'
  WHEN (nullif(p->>'courierId','') IS NOT NULL OR (d.departed_at IS NOT NULL AND to_timestamp((d.o->>'paidAt')::numeric/1000)>d.departed_at)) AND p->>'method' IN ('Crédito','Débito','Cartão','Vale-refeição','Pix') THEN 'card'
  WHEN d.departed_at IS NOT NULL AND to_timestamp((d.o->>'paidAt')::numeric/1000)<=d.departed_at THEN 'prepaid' ELSE 'store' END category,
 (p->>'amount')::numeric amount,p->>'method' method,(d.o->>'paidAt')::bigint paid_at
 FROM orders d CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.o->'payments','[]')) p
 WHERE (to_timestamp(coalesce((d.o->>'paidAt')::numeric,(d.o->>'createdAt')::numeric)/1000) AT TIME ZONE 'America/Sao_Paulo')::date=p_day
 UNION ALL
 SELECT d.order_id,(d.o->>'number')::integer,d.customer,d.status,coalesce(d.route_courier,d.assigned_courier_id),'pending',greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(d.o->'items') i)-coalesce((d.o->>'discount')::numeric,0)+coalesce((d.o->>'fee')::numeric,0)+coalesce((d.o->>'serviceAmount')::numeric,0)),d.payment_method,NULL::bigint
 FROM orders d WHERE jsonb_array_length(coalesce(d.o->'payments','[]'))=0 AND d.status<>'Cancelado' AND (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date=p_day
 )
 SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('courier_name',c.name) ORDER BY c.name,e.number),'[]') INTO result FROM entries e JOIN public.delivery_couriers c ON c.id=e.courier_id WHERE staff OR (c.user_id=auth.uid() AND c.active);
 RETURN result;
END $function$;