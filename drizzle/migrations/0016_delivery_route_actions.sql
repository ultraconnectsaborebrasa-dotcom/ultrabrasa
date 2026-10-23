ALTER POLICY route_read ON public.delivery_routes USING(public.has_role(auth.uid(),'admin'));
ALTER POLICY delivery_read ON public.delivery_orders USING(public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.save_delivery_route(route_id uuid,route_name text,courier uuid,origin_address text,stops uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE rid uuid; cnt integer; BEGIN
IF NOT public.delivery_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF; PERFORM pg_advisory_xact_lock(742021);
IF array_length(stops,1) IS NULL OR array_length(stops,1)>100 OR trim(route_name)='' THEN RAISE EXCEPTION 'Selecione pedidos e nomeie a rota'; END IF;
IF courier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=courier AND active) THEN RAISE EXCEPTION 'Entregador indisponível'; END IF;
IF route_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_routes r JOIN public.delivery_orders d ON d.route_id=r.id WHERE r.id=route_id AND d.status NOT IN ('Entregue','Cancelado')) THEN RAISE EXCEPTION 'Rota encerrada'; END IF;
PERFORM 1 FROM public.delivery_orders WHERE id=ANY(stops) FOR UPDATE;
SELECT count(*) INTO cnt FROM public.delivery_orders d WHERE id=ANY(stops) AND status IN ('Aguardando preparo','Pronto para entrega') AND (d.route_id IS NULL OR d.route_id=save_delivery_route.route_id);
IF cnt<>cardinality(stops) THEN RAISE EXCEPTION 'Pedido indisponível ou já atribuído a outra rota'; END IF;
rid=coalesce(route_id,gen_random_uuid()); INSERT INTO public.delivery_routes(id,name,courier_id,origin,created_by) VALUES(rid,left(route_name,120),courier,left(coalesce(origin_address,''),500),auth.uid()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,courier_id=EXCLUDED.courier_id,origin=EXCLUDED.origin;
UPDATE public.delivery_orders d SET route_id=NULL,position=0 WHERE d.route_id=rid;
UPDATE public.delivery_orders d SET route_id=rid,position=s.ordinality FROM unnest(stops) WITH ORDINALITY s(id,ordinality) WHERE d.id=s.id;
RETURN rid; END $$;
CREATE FUNCTION public.start_delivery_route(route_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
PERFORM pg_advisory_xact_lock(742021);
IF NOT public.delivery_staff() AND NOT (public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_routes r JOIN public.delivery_couriers c ON c.id=r.courier_id WHERE r.id=route_id AND c.user_id=auth.uid() AND c.active)) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.delivery_routes WHERE id=route_id AND courier_id IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.delivery_orders d WHERE d.route_id=start_delivery_route.route_id) OR EXISTS(SELECT 1 FROM public.delivery_orders d WHERE d.route_id=start_delivery_route.route_id AND d.status<>'Pronto para entrega') THEN RAISE EXCEPTION 'Atribua um entregador e aguarde todos os pedidos ficarem prontos'; END IF;
UPDATE public.delivery_orders d SET status='Em rota' WHERE d.route_id=start_delivery_route.route_id; END $$;
CREATE FUNCTION public.update_delivery_status(delivery_id uuid,new_status text,issue text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE d public.delivery_orders; BEGIN
SELECT * INTO d FROM public.delivery_orders WHERE id=delivery_id FOR UPDATE;
IF d.id IS NULL OR (NOT public.delivery_staff() AND NOT (public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_routes r JOIN public.delivery_couriers c ON c.id=r.courier_id WHERE r.id=d.route_id AND c.user_id=auth.uid() AND c.active))) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
IF d.status IN ('Entregue','Cancelado') THEN RAISE EXCEPTION 'Entrega encerrada'; END IF;
IF issue IS NOT NULL THEN IF trim(issue)='' THEN RAISE EXCEPTION 'Descreva o problema'; END IF; UPDATE public.delivery_orders SET problem=left(issue,1000) WHERE id=d.id; RETURN; END IF;
IF new_status<>'Entregue' OR d.status<>'Em rota' THEN RAISE EXCEPTION 'Inicie a rota antes de confirmar a entrega'; END IF;
UPDATE public.delivery_orders SET status='Entregue',delivered_at=now() WHERE id=d.id; END $$;
CREATE FUNCTION public.save_delivery_courier(courier_id uuid,courier_name text,courier_phone text,account_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE cid uuid; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
IF trim(courier_name)='' OR length(courier_name)>120 THEN RAISE EXCEPTION 'Informe o nome'; END IF;
IF account_id IS NOT NULL AND NOT public.has_role(account_id,'courier') THEN RAISE EXCEPTION 'Libere esta conta como Entregador na equipe'; END IF;
cid=coalesce(courier_id,gen_random_uuid()); INSERT INTO public.delivery_couriers(id,name,phone,user_id) VALUES(cid,trim(courier_name),left(courier_phone,25),account_id) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,user_id=EXCLUDED.user_id; RETURN cid; END $$;
CREATE FUNCTION public.save_customer_delivery_address(customer uuid,address_id uuid,input jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF; PERFORM public.validate_delivery_input(jsonb_build_object('address',input));
IF address_id IS NULL THEN INSERT INTO public.delivery_addresses(customer_id,address) VALUES(customer,input);
ELSE UPDATE public.delivery_addresses SET address=input,updated_at=now() WHERE id=address_id AND customer_id=customer; IF NOT FOUND THEN RAISE EXCEPTION 'Endereço indisponível'; END IF; END IF; END $$;
CREATE OR REPLACE FUNCTION public.revoke_pdv_access(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM pg_advisory_xact_lock(742020); IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') OR target=auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF; IF public.has_role(target,'admin') OR EXISTS(SELECT 1 FROM auth.users WHERE id=target AND lower(email)='ultraconnectsaborebrasa@gmail.com') THEN RAISE EXCEPTION 'Contas administradoras são protegidas'; END IF; DELETE FROM public.user_roles WHERE user_id=target AND role IN ('operator','cashier','courier'); END $$;
DO $$ DECLARE def text; BEGIN SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='read_delivery_board'; def=replace(def,'to_jsonb(d)||jsonb_build_object','(CASE WHEN is_admin OR d.status NOT IN (''Entregue'',''Cancelado'') THEN to_jsonb(d) ELSE to_jsonb(d)-''cash_for''-''payment_method'' END)||jsonb_build_object'); EXECUTE def; END $$;
REVOKE ALL ON FUNCTION public.save_delivery_route(uuid,text,uuid,text,uuid[]),public.start_delivery_route(uuid),public.update_delivery_status(uuid,text,text),public.save_delivery_courier(uuid,text,text,uuid),public.save_customer_delivery_address(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_delivery_route(uuid,text,uuid,text,uuid[]),public.start_delivery_route(uuid),public.update_delivery_status(uuid,text,text),public.save_delivery_courier(uuid,text,text,uuid),public.save_customer_delivery_address(uuid,uuid,jsonb) TO authenticated;