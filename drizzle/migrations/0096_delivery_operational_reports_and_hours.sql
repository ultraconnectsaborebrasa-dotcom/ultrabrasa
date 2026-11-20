ALTER TABLE public.delivery_operation_settings
 ADD COLUMN IF NOT EXISTS operating_start time NOT NULL DEFAULT '10:00',
 ADD COLUMN IF NOT EXISTS operating_end time NOT NULL DEFAULT '14:00',
 ADD COLUMN IF NOT EXISTS operating_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6];

CREATE OR REPLACE FUNCTION public.save_delivery_operating_hours(p_start time,p_end time,p_days integer[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente o administrador pode alterar o horário da operação'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_start>=p_end OR array_length(p_days,1) IS NULL OR EXISTS(SELECT 1 FROM unnest(p_days)d WHERE d<0 OR d>6) THEN RAISE EXCEPTION 'Informe horários e dias válidos'; END IF;
 UPDATE public.delivery_operation_settings SET operating_start=p_start,operating_end=p_end,operating_days=p_days,updated_at=now(),updated_by=auth.uid() WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configure a base antes de alterar os horários'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_delivery_operating_hours(time,time,integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_delivery_operating_hours(time,time,integer[]) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.read_delivery_operational_report(p_from date,p_to date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE can_manage boolean; own uuid; start_day date; end_day date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
 can_manage=public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier');
 IF NOT can_manage THEN
  IF NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT id INTO own FROM public.delivery_couriers WHERE user_id=auth.uid() AND active;
  IF own IS NULL THEN RAISE EXCEPTION 'Vincule esta conta a um entregador ativo'; END IF;
 END IF;
 start_day=p_from; end_day=p_to;
 IF start_day IS NULL OR end_day IS NULL OR end_day<start_day OR end_day-start_day>62 THEN RAISE EXCEPTION 'Selecione um período válido de até 62 dias'; END IF;
 RETURN jsonb_build_object(
 'from',start_day,'to',end_day,
 'summary',jsonb_build_object(
  'distributed',coalesce((SELECT sum(l.quantity) FROM public.courier_marmita_loads l WHERE (can_manage OR l.courier_id=own) AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),0),
  'replenished',coalesce((SELECT sum(l.quantity) FROM public.courier_marmita_loads l WHERE l.kind='replenishment' AND (can_manage OR l.courier_id=own) AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),0),
  'sold',coalesce((SELECT sum(-m.quantity_change) FROM public.courier_marmita_movements m WHERE m.kind='delivery' AND (can_manage OR m.courier_id=own) AND (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),0),
  'returned',coalesce((SELECT sum(-m.quantity_change) FROM public.courier_marmita_movements m WHERE m.kind='return' AND (can_manage OR m.courier_id=own) AND (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),0),
  'losses',coalesce((SELECT sum(-m.quantity_change) FROM public.courier_marmita_movements m WHERE m.kind='loss' AND (can_manage OR m.courier_id=own) AND (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),0),
  'remaining',coalesce((SELECT sum(s.remaining_quantity) FROM public.courier_marmita_stock s WHERE can_manage OR s.courier_id=own),0),
  'deliveries',(SELECT count(*) FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status='Entregue' AND (can_manage OR coalesce(r.courier_id,d.assigned_courier_id)=own) AND (d.delivered_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),
  'cancelled',(SELECT count(*) FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status='Cancelado' AND (can_manage OR coalesce(r.courier_id,d.assigned_courier_id)=own) AND (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),
  'occurrences',(SELECT count(*) FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.problem IS NOT NULL AND (can_manage OR coalesce(r.courier_id,d.assigned_courier_id)=own) AND (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),
  'average_minutes',coalesce((SELECT round(avg(extract(epoch FROM(d.delivered_at-d.created_at))/60)) FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status='Entregue' AND d.delivered_at IS NOT NULL AND (can_manage OR coalesce(r.courier_id,d.assigned_courier_id)=own) AND (d.delivered_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),0)
 ),
 'days',coalesce((SELECT jsonb_agg(jsonb_build_object('day',day,'distributed',distributed,'sold',sold,'deliveries',deliveries,'cancelled',cancelled) ORDER BY day) FROM(
  SELECT day,
   (SELECT coalesce(sum(l.quantity),0) FROM public.courier_marmita_loads l WHERE (can_manage OR l.courier_id=own) AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date=day) distributed,
   (SELECT coalesce(sum(-m.quantity_change),0) FROM public.courier_marmita_movements m WHERE m.kind='delivery' AND (can_manage OR m.courier_id=own) AND (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date=day) sold,
   (SELECT count(*) FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status='Entregue' AND (can_manage OR coalesce(r.courier_id,d.assigned_courier_id)=own) AND (d.delivered_at AT TIME ZONE 'America/Sao_Paulo')::date=day) deliveries,
   (SELECT count(*) FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status='Cancelado' AND (can_manage OR coalesce(r.courier_id,d.assigned_courier_id)=own) AND (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date=day) cancelled
  FROM generate_series(start_day,end_day,'1 day'::interval) day
 ) daily),'[]'),
 'couriers',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'courier_id',c.id,'name',c.name,'operational_status',c.operational_status,'remaining',s.remaining_quantity,'reserved',a.reserved,'available',CASE WHEN s.courier_id IS NULL THEN NULL ELSE s.remaining_quantity-a.reserved END,'product_name',s.product_name,'journey_status',s.journey_status,'stock_updated_at',s.updated_at,
  'pending',(SELECT count(*) FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status NOT IN ('Entregue','Cancelado') AND coalesce(r.courier_id,d.assigned_courier_id)=c.id),
  'delivered',(SELECT count(*) FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status='Entregue' AND coalesce(r.courier_id,d.assigned_courier_id)=c.id AND (d.delivered_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),
  'average_minutes',coalesce((SELECT round(avg(extract(epoch FROM(d.delivered_at-d.created_at))/60)) FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status='Entregue' AND coalesce(r.courier_id,d.assigned_courier_id)=c.id AND (d.delivered_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day),0)
 ) ORDER BY c.name) FROM public.delivery_couriers c LEFT JOIN public.courier_marmita_stock s ON s.courier_id=c.id LEFT JOIN LATERAL(SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0) reserved FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE d.status NOT IN ('Entregue','Cancelado') AND coalesce(r.courier_id,d.assigned_courier_id)=c.id) a ON true WHERE can_manage OR c.id=own),'[]'),
 'journeys',coalesce((SELECT jsonb_agg(journey ORDER BY started_at DESC) FROM(
  SELECT jsonb_build_object(
   'journey_id',j.journey_id,'courier_id',j.courier_id,'courier_name',j.courier_name,'product_name',j.product_name,'started_at',j.started_at,'last_movement_at',j.last_movement_at,'distributed',j.distributed,
   'sold',coalesce((SELECT sum(-m.quantity_change) FROM public.courier_marmita_movements m WHERE m.journey_id=j.journey_id AND m.kind='delivery'),0),
   'returned',coalesce((SELECT sum(-m.quantity_change) FROM public.courier_marmita_movements m WHERE m.journey_id=j.journey_id AND m.kind='return'),0),
   'losses',coalesce((SELECT sum(-m.quantity_change) FROM public.courier_marmita_movements m WHERE m.journey_id=j.journey_id AND m.kind='loss'),0),
   'adjustments',coalesce((SELECT sum(m.quantity_change) FROM public.courier_marmita_movements m WHERE m.journey_id=j.journey_id AND m.kind='correct'),0),
   'status',coalesce((SELECT s.journey_status FROM public.courier_marmita_stock s WHERE s.journey_id=j.journey_id AND s.courier_id=j.courier_id),'closed')
  ) journey,j.started_at
  FROM(SELECT l.journey_id,l.courier_id,c.name courier_name,min(l.product_name) product_name,min(l.created_at) started_at,max(l.created_at) last_movement_at,sum(l.quantity) distributed FROM public.courier_marmita_loads l JOIN public.delivery_couriers c ON c.id=l.courier_id WHERE (can_manage OR l.courier_id=own) AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN start_day AND end_day GROUP BY l.journey_id,l.courier_id,c.name) j
 ) report),'[]')
 );
END;
$$;
REVOKE ALL ON FUNCTION public.read_delivery_operational_report(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_delivery_operational_report(date,date) TO authenticated,service_role;