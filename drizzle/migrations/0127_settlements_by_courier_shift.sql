ALTER TABLE public.delivery_orders ADD COLUMN courier_shift_id uuid REFERENCES public.courier_time_entries(id) ON DELETE SET NULL;
CREATE INDEX delivery_orders_courier_shift_idx ON public.delivery_orders(courier_shift_id);
UPDATE public.delivery_orders d SET courier_shift_id=(SELECT t.id FROM public.courier_time_entries t WHERE t.courier_id=coalesce((SELECT r.courier_id FROM public.delivery_routes r WHERE r.id=d.route_id),d.assigned_courier_id) AND coalesce(d.departed_at,d.created_at)>=t.entry_at AND coalesce(d.departed_at,d.created_at)<=coalesce(t.exit_at,now()) ORDER BY t.entry_at DESC LIMIT 1) WHERE courier_shift_id IS NULL;
CREATE FUNCTION public.bind_delivery_courier_shift() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid;
BEGIN
 target=coalesce((SELECT courier_id FROM public.delivery_routes WHERE id=NEW.route_id),NEW.assigned_courier_id);
 IF TG_OP='INSERT' THEN
  SELECT id INTO NEW.courier_shift_id FROM public.courier_time_entries WHERE courier_id=target AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1;
 ELSIF NEW.status NOT IN ('Entregue','Cancelado') AND (NEW.assigned_courier_id IS DISTINCT FROM OLD.assigned_courier_id OR NEW.route_id IS DISTINCT FROM OLD.route_id OR NEW.courier_shift_id IS NULL) THEN
  IF NEW.courier_shift_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.courier_time_entries WHERE id=NEW.courier_shift_id AND courier_id=target) THEN
   SELECT id INTO NEW.courier_shift_id FROM public.courier_time_entries WHERE courier_id=target AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bind_delivery_courier_shift() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bind_delivery_courier_shift BEFORE INSERT OR UPDATE ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION public.bind_delivery_courier_shift();
CREATE FUNCTION public.guard_shift_exit_deliveries() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.exit_at IS NULL AND NEW.exit_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE coalesce(r.courier_id,d.assigned_courier_id)=NEW.courier_id AND d.status NOT IN ('Entregue','Cancelado')) THEN
  RAISE EXCEPTION 'Confira e finalize as entregas pendentes ou transfira para outro entregador antes de encerrar o turno. Pagamentos continuam pendentes até a baixa manual.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_shift_exit_deliveries() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_shift_exit_deliveries BEFORE UPDATE OF exit_at ON public.courier_time_entries FOR EACH ROW EXECUTE FUNCTION public.guard_shift_exit_deliveries();
CREATE OR REPLACE FUNCTION public.read_courier_settlement(p_day date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date)) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE snapshot jsonb; is_admin boolean; staff boolean; result jsonb;
BEGIN
 is_admin=public.has_role(auth.uid(),'admin'); staff=is_admin OR public.has_role(auth.uid(),'cashier');
 IF NOT staff AND NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF p_day IS NULL OR (NOT is_admin AND p_day<>(now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN RAISE EXCEPTION 'Consulta limitada ao dia atual'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 WITH orders AS (
 SELECT d.*,o,r.courier_id route_courier,t.id shift_id,t.shift_code,t.exit_at shift_closed_at FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id LEFT JOIN public.courier_time_entries t ON t.id=d.courier_shift_id JOIN LATERAL (SELECT value o FROM jsonb_array_elements(coalesce(snapshot->'orders','[]')) value WHERE value->>'id'=d.order_id) x ON true WHERE coalesce(t.shift_date,(d.created_at AT TIME ZONE 'America/Sao_Paulo')::date)=p_day
 ), entries AS (
 SELECT d.order_id,(d.o->>'number')::integer number,d.customer,d.status,coalesce(nullif(p->>'courierId','')::uuid,d.route_courier,d.assigned_courier_id) courier_id,
 CASE WHEN p->>'verification'='unverified' THEN 'unverified'
 WHEN (nullif(p->>'courierId','') IS NOT NULL OR (d.departed_at IS NOT NULL AND to_timestamp((d.o->>'paidAt')::numeric/1000)>d.departed_at)) AND p->>'method'='Dinheiro' THEN 'cash'
 WHEN (nullif(p->>'courierId','') IS NOT NULL OR (d.departed_at IS NOT NULL AND to_timestamp((d.o->>'paidAt')::numeric/1000)>d.departed_at)) AND p->>'method' IN ('Crédito','Débito','Cartão','Vale-refeição','Pix') THEN 'card'
 WHEN d.departed_at IS NOT NULL AND to_timestamp((d.o->>'paidAt')::numeric/1000)<=d.departed_at THEN 'prepaid' ELSE 'store' END category,
 (p->>'amount')::numeric amount,p->>'method' method,(d.o->>'paidAt')::bigint paid_at,d.shift_id,d.shift_code,d.shift_closed_at
 FROM orders d CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.o->'payments','[]')) p
 UNION ALL
 SELECT d.order_id,(d.o->>'number')::integer,d.customer,d.status,coalesce(d.route_courier,d.assigned_courier_id),'pending',greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(d.o->'items') i)-coalesce((d.o->>'discount')::numeric,0)+coalesce((d.o->>'fee')::numeric,0)+coalesce((d.o->>'serviceAmount')::numeric,0)),d.payment_method,NULL::bigint,d.shift_id,d.shift_code,d.shift_closed_at
 FROM orders d WHERE jsonb_array_length(coalesce(d.o->'payments','[]'))=0 AND d.status<>'Cancelado'
 )
 SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('courier_name',c.name) ORDER BY c.name,e.shift_code,e.number),'[]') INTO result FROM entries e JOIN public.delivery_couriers c ON c.id=e.courier_id WHERE staff OR (c.user_id=auth.uid() AND c.active);
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.read_courier_settlement(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_courier_settlement(date) TO authenticated;