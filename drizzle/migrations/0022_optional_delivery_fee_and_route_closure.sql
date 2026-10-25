DO $migration$
DECLARE definition text; changed text;
BEGIN
 SELECT pg_get_functiondef('public.submit_pdv_operator(jsonb)'::regprocedure) INTO definition;
 changed=replace(definition, 'CASE WHEN request->>''type''=''Delivery'' THEN coalesce((snapshot->''settings''->>''deliveryFee'')::numeric,0) ELSE 0 END', 'CASE WHEN request->>''type''=''Delivery'' AND request->''delivery''->''chargeDeliveryFee''=''true''::jsonb THEN coalesce((snapshot->''settings''->>''deliveryFee'')::numeric,0) ELSE 0 END');
 IF changed=definition THEN RAISE EXCEPTION 'Delivery fee expression not found'; END IF; EXECUTE changed;
 SELECT pg_get_functiondef('public.read_pdv_operator()'::regprocedure) INTO definition;
 changed=replace(definition, 'RETURN jsonb_build_object(''products''', 'RETURN jsonb_build_object(''deliveryFee'',coalesce((snapshot->''settings''->>''deliveryFee'')::numeric,0),''products''');
 IF changed=definition THEN RAISE EXCEPTION 'Operator response not found'; END IF; EXECUTE changed;
 SELECT pg_get_functiondef('public.read_pdv_cashier()'::regprocedure) INTO definition;
 changed=replace(definition, '''paymentMethods'',coalesce', '''deliveryFee'',coalesce((snapshot->''settings''->>''deliveryFee'')::numeric,0),''paymentMethods'',coalesce');
 IF changed=definition THEN RAISE EXCEPTION 'Cashier response not found'; END IF; EXECUTE changed;
END $migration$;
CREATE OR REPLACE FUNCTION public.update_delivery_status(delivery_id uuid, new_status text, issue text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE d public.delivery_orders; BEGIN
PERFORM pg_advisory_xact_lock(742021); SELECT * INTO d FROM public.delivery_orders WHERE id=delivery_id FOR UPDATE;
IF d.id IS NULL OR (NOT public.delivery_staff() AND NOT (public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_routes r JOIN public.delivery_couriers c ON c.id=r.courier_id WHERE r.id=d.route_id AND c.user_id=auth.uid() AND c.active))) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
IF d.status IN ('Entregue','Cancelado') THEN RAISE EXCEPTION 'Entrega encerrada'; END IF;
IF issue IS NOT NULL THEN IF trim(issue)='' THEN RAISE EXCEPTION 'Descreva o problema'; END IF; UPDATE public.delivery_orders SET problem=left(issue,1000) WHERE id=d.id; RETURN; END IF;
IF new_status IS DISTINCT FROM 'Entregue' THEN RAISE EXCEPTION 'Status inválido'; END IF;
UPDATE public.delivery_orders SET status='Entregue',delivered_at=now() WHERE id=d.id; END $function$;
CREATE OR REPLACE FUNCTION public.finish_delivery_route(route_id uuid, new_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
PERFORM pg_advisory_xact_lock(742021);
IF NOT EXISTS(SELECT 1 FROM public.delivery_routes r WHERE r.id=finish_delivery_route.route_id) OR (NOT public.delivery_staff() AND NOT (new_status='Entregue' AND public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_routes r JOIN public.delivery_couriers c ON c.id=r.courier_id WHERE r.id=finish_delivery_route.route_id AND c.user_id=auth.uid() AND c.active))) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
IF new_status IS NULL OR new_status NOT IN ('Entregue','Cancelado') THEN RAISE EXCEPTION 'Status inválido'; END IF;
PERFORM 1 FROM public.delivery_orders d WHERE d.route_id=finish_delivery_route.route_id FOR UPDATE;
IF NOT EXISTS(SELECT 1 FROM public.delivery_orders d WHERE d.route_id=finish_delivery_route.route_id AND d.status NOT IN ('Entregue','Cancelado')) THEN RAISE EXCEPTION 'Rota encerrada'; END IF;
UPDATE public.delivery_orders d SET status=new_status,delivered_at=CASE WHEN new_status='Entregue' THEN now() ELSE d.delivered_at END WHERE d.route_id=finish_delivery_route.route_id AND d.status NOT IN ('Entregue','Cancelado');
END $function$;
REVOKE ALL ON FUNCTION public.finish_delivery_route(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_delivery_route(uuid,text) TO authenticated, service_role;