ALTER TABLE public.delivery_orders ADD COLUMN courier_settlement_links jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.bind_delivery_courier_shift() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid; active_shift uuid;
BEGIN
 target=coalesce((SELECT courier_id FROM public.delivery_routes WHERE id=NEW.route_id),NEW.assigned_courier_id);
 IF target IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  SELECT id INTO NEW.courier_shift_id FROM public.courier_time_entries WHERE courier_id=target AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1 FOR UPDATE;
 ELSIF NEW.status NOT IN ('Entregue','Cancelado') AND (NEW.assigned_courier_id IS DISTINCT FROM OLD.assigned_courier_id OR NEW.route_id IS DISTINCT FROM OLD.route_id OR NEW.courier_shift_id IS NULL) THEN
  SELECT id INTO active_shift FROM public.courier_time_entries WHERE courier_id=target AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1 FOR UPDATE;
  IF active_shift IS NULL THEN RAISE EXCEPTION 'Entregador sem ponto aberto'; END IF;
  NEW.courier_shift_id=active_shift;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_shift_exit_deliveries() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb;
BEGIN
 IF OLD.exit_at IS NOT NULL OR NEW.exit_at IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(742024);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 UPDATE public.delivery_orders d SET courier_settlement_links=coalesce((SELECT jsonb_object_agg(ord::text,jsonb_build_object('shift_id',NEW.id,'courier_id',coalesce(nullif(p->>'courierId','')::uuid,NEW.courier_id),'category',CASE
 WHEN (nullif(p->>'courierId','') IS NOT NULL OR (d.departed_at IS NOT NULL AND to_timestamp((o->>'paidAt')::numeric/1000)>d.departed_at)) AND p->>'method'='Dinheiro' THEN 'cash'
 WHEN (nullif(p->>'courierId','') IS NOT NULL OR (d.departed_at IS NOT NULL AND to_timestamp((o->>'paidAt')::numeric/1000)>d.departed_at)) AND p->>'method' IN ('Crédito','Débito','Cartão','Vale-refeição','Pix') THEN 'card'
 WHEN d.departed_at IS NOT NULL AND to_timestamp((o->>'paidAt')::numeric/1000)<=d.departed_at THEN 'prepaid' ELSE 'store' END)) FROM jsonb_array_elements(coalesce(snapshot->'orders','[]')) o CROSS JOIN LATERAL jsonb_array_elements(coalesce(o->'payments','[]')) WITH ORDINALITY AS payment(p,ord) WHERE o->>'id'=d.order_id),'{}'::jsonb)||d.courier_settlement_links
 WHERE d.courier_shift_id=NEW.id;
 INSERT INTO public.delivery_operational_events(delivery_id,courier_id,event,from_courier_id,details,actor_id)
 SELECT d.id,NEW.courier_id,'shift_released',NEW.courier_id,jsonb_build_object('shift_id',NEW.id,'previous_status',d.status,'reason','Encerramento do turno'),auth.uid() FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE coalesce(r.courier_id,d.assigned_courier_id)=NEW.courier_id AND d.status NOT IN ('Entregue','Cancelado');
 UPDATE public.delivery_orders d SET route_id=NULL,assigned_courier_id=NULL,position=0,status='Pronto para entrega',departed_at=NULL,arrived_at=NULL WHERE d.id IN (SELECT x.id FROM public.delivery_orders x LEFT JOIN public.delivery_routes r ON r.id=x.route_id WHERE coalesce(r.courier_id,x.assigned_courier_id)=NEW.courier_id AND x.status NOT IN ('Entregue','Cancelado'));
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.read_courier_settlement(p_day date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date)) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE snapshot jsonb; is_admin boolean; staff boolean; result jsonb;
BEGIN
 is_admin=public.has_role(auth.uid(),'admin'); staff=is_admin OR public.has_role(auth.uid(),'cashier');
 IF NOT staff AND NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF p_day IS NULL OR (NOT is_admin AND p_day<>(now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN RAISE EXCEPTION 'Consulta limitada ao dia atual'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 WITH orders AS (
 SELECT d.*,o,r.courier_id route_courier,t.id shift_id,t.courier_id shift_courier,t.shift_date,t.shift_code,t.exit_at shift_closed_at FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id LEFT JOIN public.courier_time_entries t ON t.id=d.courier_shift_id JOIN LATERAL (SELECT value o FROM jsonb_array_elements(coalesce(snapshot->'orders','[]')) value WHERE value->>'id'=d.order_id) x ON true
 ), entries AS (
 SELECT d.order_id,(d.o->>'number')::integer number,d.customer,d.status,coalesce((link->>'courier_id')::uuid,nullif(p->>'courierId','')::uuid,d.route_courier,d.assigned_courier_id,d.shift_courier) courier_id,
 CASE WHEN p->>'verification'='unverified' THEN 'unverified'
 WHEN link->>'category' IS NOT NULL THEN link->>'category'
 WHEN (nullif(p->>'courierId','') IS NOT NULL OR (d.departed_at IS NOT NULL AND to_timestamp((d.o->>'paidAt')::numeric/1000)>d.departed_at)) AND p->>'method'='Dinheiro' THEN 'cash'
 WHEN (nullif(p->>'courierId','') IS NOT NULL OR (d.departed_at IS NOT NULL AND to_timestamp((d.o->>'paidAt')::numeric/1000)>d.departed_at)) AND p->>'method' IN ('Crédito','Débito','Cartão','Vale-refeição','Pix') THEN 'card'
 WHEN d.departed_at IS NOT NULL AND to_timestamp((d.o->>'paidAt')::numeric/1000)<=d.departed_at THEN 'prepaid' ELSE 'store' END category,
 (p->>'amount')::numeric amount,p->>'method' method,(d.o->>'paidAt')::bigint paid_at,coalesce(saved.id,d.shift_id) shift_id,coalesce(saved.shift_code,d.shift_code) shift_code,coalesce(saved.exit_at,d.shift_closed_at) shift_closed_at
 FROM orders d CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.o->'payments','[]')) WITH ORDINALITY AS payment(p,ord) CROSS JOIN LATERAL (SELECT d.courier_settlement_links->ord::text link) l LEFT JOIN public.courier_time_entries saved ON saved.id=(link->>'shift_id')::uuid
 WHERE coalesce(saved.shift_date,d.shift_date,(d.created_at AT TIME ZONE 'America/Sao_Paulo')::date)=p_day
 UNION ALL
 SELECT d.order_id,(d.o->>'number')::integer,d.customer,d.status,coalesce(d.route_courier,d.assigned_courier_id,d.shift_courier),'pending',greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(d.o->'items') i)-coalesce((d.o->>'discount')::numeric,0)+coalesce((d.o->>'fee')::numeric,0)+coalesce((d.o->>'serviceAmount')::numeric,0)),d.payment_method,NULL::bigint,d.shift_id,d.shift_code,d.shift_closed_at
 FROM orders d WHERE jsonb_array_length(coalesce(d.o->'payments','[]'))=0 AND d.status<>'Cancelado' AND coalesce(d.shift_date,(d.created_at AT TIME ZONE 'America/Sao_Paulo')::date)=p_day
 )
 SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('courier_name',c.name) ORDER BY c.name,e.shift_code,e.number),'[]') INTO result FROM entries e JOIN public.delivery_couriers c ON c.id=e.courier_id WHERE staff OR (c.user_id=auth.uid() AND c.active);
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.bind_delivery_courier_shift(),public.guard_shift_exit_deliveries() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.read_courier_settlement(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_courier_settlement(date) TO authenticated;