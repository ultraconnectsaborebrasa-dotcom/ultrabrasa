CREATE OR REPLACE FUNCTION public.depart_delivery(_order text, _courier uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
 d public.delivery_orders;
 o jsonb;
 s jsonb;
 rid uuid;
 route_courier uuid;
 next_position integer;
 origin text;
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
  IF _courier IS NOT NULL AND route_courier IS NOT NULL AND route_courier<>_courier THEN
   RAISE EXCEPTION 'Este pedido já pertence a uma rota de outro entregador. Faça a troca pela montagem da rota.';
  END IF;
  IF _courier IS NOT NULL AND route_courier IS NULL THEN
   UPDATE public.delivery_routes SET courier_id=_courier WHERE id=d.route_id;
  END IF;
 ELSIF _courier IS NOT NULL THEN
  SELECT r.id INTO rid
  FROM public.delivery_routes r
  WHERE r.courier_id=_courier
   AND EXISTS(SELECT 1 FROM public.delivery_orders active WHERE active.route_id=r.id AND active.status='Em rota')
  ORDER BY r.created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF rid IS NULL THEN
   rid=gen_random_uuid();
   SELECT base_address INTO origin FROM public.delivery_operation_settings WHERE id=1;
   INSERT INTO public.delivery_routes(id,name,courier_id,origin,created_by)
   VALUES(rid,left('Pedido #'||coalesce(o->>'number',_order)||' · '||d.customer,120),_courier,left(coalesce(origin,''),500),auth.uid());
   next_position=1;
  ELSE
   SELECT coalesce(max(position),0)+1 INTO next_position FROM public.delivery_orders WHERE route_id=rid;
  END IF;
 END IF;

 UPDATE public.delivery_orders
 SET status='Em rota',
  departed_at=coalesce(departed_at,now()),
  assigned_courier_id=coalesce(_courier,assigned_courier_id),
  route_id=coalesce(rid,route_id),
  position=CASE WHEN rid IS NOT NULL THEN next_position ELSE position END
 WHERE id=d.id;

 IF o->>'status' IN ('cozinha','pronto','pago') THEN
  UPDATE public.pdv_state
  SET data=jsonb_set(s,'{orders}',(
   SELECT jsonb_agg(CASE WHEN value->>'id'=_order THEN value||jsonb_build_object('status','entrega')||CASE WHEN value->>'status'='pago' AND value->>'paymentStatus' IS NULL THEN jsonb_build_object('paymentStatus','pago') ELSE '{}'::jsonb END ELSE value END)
   FROM jsonb_array_elements(s->'orders')
  )),revision=revision+1,updated_at=now()
  WHERE id=1;
 END IF;
END
$function$;

DO $repair$
DECLARE
 d record;
 rid uuid;
 next_position integer;
 origin text;
 courier_name text;
BEGIN
 SELECT base_address INTO origin FROM public.delivery_operation_settings WHERE id=1;
 FOR d IN
  SELECT * FROM public.delivery_orders
  WHERE status='Em rota' AND route_id IS NULL AND assigned_courier_id IS NOT NULL
  ORDER BY assigned_courier_id,departed_at NULLS LAST,created_at
 LOOP
  SELECT r.id INTO rid
  FROM public.delivery_routes r
  WHERE r.courier_id=d.assigned_courier_id
   AND EXISTS(SELECT 1 FROM public.delivery_orders active WHERE active.route_id=r.id AND active.status='Em rota')
  ORDER BY r.created_at DESC
  LIMIT 1;
  IF rid IS NULL THEN
   rid=gen_random_uuid();
   SELECT name INTO courier_name FROM public.delivery_couriers WHERE id=d.assigned_courier_id;
   INSERT INTO public.delivery_routes(id,name,courier_id,origin,created_by)
   VALUES(rid,left('Saídas · '||coalesce(courier_name,'Entregador'),120),d.assigned_courier_id,left(coalesce(origin,''),500),NULL);
  END IF;
  SELECT coalesce(max(position),0)+1 INTO next_position FROM public.delivery_orders WHERE route_id=rid;
  UPDATE public.delivery_orders SET route_id=rid,position=next_position WHERE id=d.id;
 END LOOP;
END
$repair$;