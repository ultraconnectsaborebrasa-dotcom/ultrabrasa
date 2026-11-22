CREATE OR REPLACE FUNCTION public.update_delivery_address(delivery_id uuid,input jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE d public.delivery_orders; BEGIN
IF NOT public.delivery_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF; PERFORM pg_advisory_xact_lock(742021); SELECT * INTO d FROM public.delivery_orders WHERE id=delivery_id FOR UPDATE;
IF d.id IS NULL OR d.status NOT IN ('Aguardando preparo','Pronto para entrega','Em rota') THEN RAISE EXCEPTION 'Entrega indisponível'; END IF;
IF d.status = 'Em rota' AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Somente o administrador ou o caixa pode corrigir uma entrega em rota'; END IF;
PERFORM public.validate_delivery_input(jsonb_build_object('address',input));
UPDATE public.delivery_orders SET address=input WHERE id=d.id;
IF d.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_addresses WHERE customer_id=d.customer_id AND address=input) THEN INSERT INTO public.delivery_addresses(customer_id,address) VALUES(d.customer_id,input); END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_delivery_address(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_delivery_address(uuid,jsonb) TO authenticated,service_role;