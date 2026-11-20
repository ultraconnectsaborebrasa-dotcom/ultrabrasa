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
 UPDATE public.delivery_orders d SET route_id=NULL,position=0,assigned_courier_id=NULL WHERE d.route_id=rid;
 UPDATE public.delivery_orders d SET route_id=rid,position=s.ordinality,assigned_courier_id=courier FROM unnest(stops) WITH ORDINALITY s(id,ordinality) WHERE d.id=s.id;
 IF courier IS NOT NULL THEN
  INSERT INTO public.delivery_operational_events(delivery_id,courier_id,event,to_courier_id,details,actor_id)
  SELECT d.id,courier,'assigned',courier,jsonb_build_object('route_id',rid),auth.uid() FROM public.delivery_orders d WHERE d.id=ANY(stops);
 END IF;
 RETURN rid;
END;
$$;