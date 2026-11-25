CREATE OR REPLACE FUNCTION public.read_delivery_receivables(p_day date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; is_admin boolean; staff boolean; result jsonb;
BEGIN
 is_admin=public.has_role(auth.uid(),'admin'); staff=is_admin OR public.has_role(auth.uid(),'cashier');
 IF NOT staff AND NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF p_day IS NULL OR (NOT is_admin AND p_day<>(now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN RAISE EXCEPTION 'Consulta limitada ao dia atual'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.order_id,'number',o->'number','customer',d.customer,'total',t.total,'status',d.status,'courier_id',c.id,'courier_name',c.name,'method',d.payment_method,'note',coalesce(o->>'note',''),'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',i->>'name','qty',i->'qty','note',coalesce(i->>'note',''))),'[]'::jsonb) FROM jsonb_array_elements(coalesce(o->'items','[]'::jsonb)) i)) ORDER BY d.created_at),'[]'::jsonb) INTO result
 FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id LEFT JOIN public.delivery_couriers c ON c.id=coalesce(r.courier_id,d.assigned_courier_id)
 JOIN LATERAL(SELECT value o FROM jsonb_array_elements(coalesce(snapshot->'orders','[]'::jsonb)) value WHERE value->>'id'=d.order_id) x ON true
 CROSS JOIN LATERAL(SELECT greatest(0,coalesce((SELECT sum((i->>'qty')::numeric*(i->>'price')::numeric) FROM jsonb_array_elements(coalesce(o->'items','[]'::jsonb)) i),0)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,0)) total) t
 WHERE (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date=p_day AND d.status<>'Cancelado' AND o->>'status' NOT IN ('cancelado','pago') AND coalesce(o->>'paymentStatus','')<>'pago' AND jsonb_array_length(coalesce(o->'payments','[]'::jsonb))=0
 AND (staff OR (c.user_id=auth.uid() AND c.active AND d.status NOT IN ('Entregue','Cancelado')));
 RETURN jsonb_build_object('orders',result,'methods',coalesce(snapshot->'settings'->'paymentMethods','[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.read_delivery_receivables(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_delivery_receivables(date) TO authenticated,service_role;