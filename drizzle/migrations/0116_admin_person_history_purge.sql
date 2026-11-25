CREATE TABLE public.pdv_deleted_order_ids(order_id text PRIMARY KEY,deleted_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.pdv_deleted_order_ids TO service_role;
ALTER TABLE public.pdv_deleted_order_ids ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.person_purge_cleanup(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),auth_ids uuid[] NOT NULL DEFAULT '{}',storage_paths text[] NOT NULL DEFAULT '{}');
GRANT ALL ON public.person_purge_cleanup TO service_role;
ALTER TABLE public.person_purge_cleanup ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.filter_deleted_pdv_orders() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.data=jsonb_set(NEW.data,'{orders}',coalesce((SELECT jsonb_agg(o) FROM jsonb_array_elements(coalesce(NEW.data->'orders','[]')) o WHERE NOT EXISTS(SELECT 1 FROM public.pdv_deleted_order_ids t WHERE t.order_id=o->>'id')),'[]'));
 RETURN NEW;
END $$;
CREATE TRIGGER aa_filter_deleted_orders BEFORE INSERT OR UPDATE ON public.pdv_state FOR EACH ROW EXECUTE FUNCTION public.filter_deleted_pdv_orders();
DO $patch$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.guard_terminal_pdv_orders()'::regprocedure) INTO def;
 def=replace(def,'BEGIN','BEGIN IF current_setting(''app.person_purge'',true)=''on'' AND public.has_role(auth.uid(),''admin'') THEN RETURN NEW; END IF;');
 EXECUTE def;
 SELECT pg_get_functiondef('public.read_pdv_cashier()'::regprocedure) INTO def;
 def=replace(def,'''deliveryFee'',coalesce','''autoServiceOnTable'',coalesce((snapshot->''settings''->>''autoServiceOnTable'')::boolean,true),''deliveryFee'',coalesce');
 EXECUTE def;
END $patch$;

CREATE OR REPLACE FUNCTION public.purge_person_history(p_kind text,p_id uuid,p_execute boolean DEFAULT false,p_confirmation text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; person_name text; phone_value text; phones text[]='{}'; couriers uuid[]='{}'; account_ids uuid[]='{}'; orders text[]='{}'; deliveries uuid[]='{}'; requests uuid[]='{}'; receipts uuid[]='{}'; paths text[]='{}'; msgs uuid[]='{}'; wa_ids text[]='{}'; cleanup_id uuid; blocked boolean=false; result jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente o administrador pode excluir definitivamente'; END IF;
 IF p_kind NOT IN ('customer','courier','staff') THEN RAISE EXCEPTION 'Cadastro inválido'; END IF;
 PERFORM pg_advisory_xact_lock(742021); PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 IF p_kind='customer' THEN
  SELECT name,phone INTO person_name,phone_value FROM public.pdv_customers WHERE id=p_id FOR UPDATE;
  IF nullif(phone_value,'') IS NOT NULL THEN phones=array[phone_value]; END IF;
 ELSIF p_kind='courier' THEN
  SELECT name,CASE WHEN user_id IS NULL THEN '{}'::uuid[] ELSE array[user_id] END INTO person_name,account_ids FROM public.delivery_couriers WHERE id=p_id FOR UPDATE; couriers=array[p_id];
 ELSE
  SELECT display_name INTO person_name FROM public.profiles WHERE id=p_id FOR UPDATE; account_ids=array[p_id];
  SELECT coalesce(array_agg(id),'{}') INTO couriers FROM public.delivery_couriers WHERE user_id=p_id;
 END IF;
 IF person_name IS NULL THEN RAISE EXCEPTION 'Pessoa não encontrada'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=ANY(account_ids) AND role='admin') OR auth.uid()=ANY(account_ids) THEN RAISE EXCEPTION 'Conta administradora protegida'; END IF;
 SELECT coalesce(array_agg(DISTINCT id),'{}') INTO orders FROM (
  SELECT o->>'id' id FROM jsonb_array_elements(coalesce(snapshot->'orders','[]')) o WHERE (p_kind='staff' AND o->>'sellerId'=p_id::text) OR (p_kind='customer' AND public.normalize_phone(o->>'customerPhone')=ANY(phones)) OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(o->'payments','[]')) pay WHERE nullif(pay->>'courierId','')::uuid=ANY(couriers))
  UNION SELECT order_id FROM public.pdv_customer_visits WHERE (p_kind='customer' AND customer_id=p_id) OR (p_kind='staff' AND seller_id=p_id)
  UNION SELECT d.order_id FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id WHERE (p_kind='customer' AND d.customer_id=p_id) OR d.assigned_courier_id=ANY(couriers) OR r.courier_id=ANY(couriers)
  UNION SELECT order_id FROM public.whatsapp_order_requests WHERE phone=ANY(phones) AND order_id IS NOT NULL
 ) linked;
 SELECT coalesce(array_agg(id),'{}') INTO deliveries FROM public.delivery_orders WHERE order_id=ANY(orders);
 SELECT coalesce(array_agg(id),'{}') INTO requests FROM public.whatsapp_order_requests WHERE order_id=ANY(orders) OR phone=ANY(phones);
 SELECT coalesce(array_agg(id),'{}'),coalesce(array_agg(storage_path) FILTER(WHERE storage_path IS NOT NULL),'{}') INTO receipts,paths FROM public.payment_receipts WHERE order_id=ANY(orders) OR request_id=ANY(requests) OR phone=ANY(phones);
 SELECT coalesce(array_agg(id),'{}'),coalesce(array_agg(wa_message_id) FILTER(WHERE wa_message_id IS NOT NULL),'{}') INTO msgs,wa_ids FROM public.whatsapp_messages WHERE phone=ANY(phones) OR order_id=ANY(orders);
 blocked=EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(snapshot->'orders','[]')) o WHERE o->>'id'=ANY(orders) AND o->>'status' IN ('aberta','cozinha','pronto','entrega')) OR EXISTS(SELECT 1 FROM public.delivery_orders WHERE id=ANY(deliveries) AND status NOT IN ('Entregue','Cancelado')) OR EXISTS(SELECT 1 FROM public.courier_time_entries WHERE courier_id=ANY(couriers) AND exit_at IS NULL) OR EXISTS(SELECT 1 FROM public.courier_marmita_stock WHERE courier_id=ANY(couriers) AND remaining_quantity>0) OR EXISTS(SELECT 1 FROM public.whatsapp_jobs WHERE state='running' AND (phone=ANY(phones) OR payload->>'orderId'=ANY(orders)));
 result=jsonb_build_object('name',person_name,'orders',cardinality(orders),'deliveries',cardinality(deliveries),'receipts',cardinality(receipts),'messages',cardinality(msgs),'blocked',blocked);
 IF NOT p_execute THEN RETURN result; END IF;
 IF p_confirmation IS DISTINCT FROM 'EXCLUIR' THEN RAISE EXCEPTION 'Digite EXCLUIR para confirmar'; END IF;
 IF blocked THEN RAISE EXCEPTION 'Encerre pedidos, entregas, ponto e cargas em andamento antes de excluir'; END IF;
 INSERT INTO public.pdv_deleted_order_ids(order_id) SELECT unnest(orders) ON CONFLICT DO NOTHING;
 DELETE FROM public.payment_receipt_events WHERE receipt_id=ANY(receipts);
 DELETE FROM public.payment_receipts WHERE id=ANY(receipts);
 DELETE FROM public.whatsapp_jobs WHERE phone=ANY(phones) OR payload->>'orderId'=ANY(orders) OR payload->>'requestId'=ANY(SELECT unnest(requests)::text);
 DELETE FROM public.whatsapp_pending_statuses WHERE wa_message_id=ANY(wa_ids);
 DELETE FROM public.whatsapp_messages WHERE id=ANY(msgs);
 DELETE FROM public.whatsapp_order_requests WHERE id=ANY(requests);
 DELETE FROM public.whatsapp_notes WHERE phone=ANY(phones);
 DELETE FROM public.whatsapp_conversations WHERE phone=ANY(phones);
 DELETE FROM public.whatsapp_webhook_events WHERE EXISTS(SELECT 1 FROM jsonb_path_query(payload,'$.** ? (@.type() == "string")') value WHERE value #>> '{}' = ANY(phones));
 DELETE FROM public.external_delivery_events WHERE order_id=ANY(orders);
 DELETE FROM public.external_delivery_outbox WHERE order_id=ANY(orders);
 DELETE FROM public.delivery_operational_events WHERE delivery_id=ANY(deliveries) OR courier_id=ANY(couriers) OR from_courier_id=ANY(couriers) OR to_courier_id=ANY(couriers);
 DELETE FROM public.courier_marmita_movements WHERE delivery_id=ANY(deliveries) OR courier_id=ANY(couriers);
 DELETE FROM public.delivery_orders WHERE id=ANY(deliveries);
 DELETE FROM public.delivery_routes r WHERE r.courier_id=ANY(couriers) AND NOT EXISTS(SELECT 1 FROM public.delivery_orders d WHERE d.route_id=r.id);
 DELETE FROM public.pdv_customer_visits WHERE order_id=ANY(orders) OR (p_kind='customer' AND customer_id=p_id) OR (p_kind='staff' AND seller_id=p_id);
 DELETE FROM public.courier_locations WHERE courier_id=ANY(couriers);
 DELETE FROM public.courier_time_entries WHERE courier_id=ANY(couriers);
 DELETE FROM public.courier_marmita_loads WHERE courier_id=ANY(couriers);
 DELETE FROM public.courier_marmita_stock WHERE courier_id=ANY(couriers);
 DELETE FROM public.delivery_couriers WHERE id=ANY(couriers);
 IF p_kind='customer' THEN
  DELETE FROM public.delivery_addresses WHERE customer_id=p_id;
  DELETE FROM public.customer_identity_changes WHERE customer_id=p_id;
  DELETE FROM public.pdv_customers WHERE id=p_id;
 END IF;
 DELETE FROM public.user_roles WHERE user_id=ANY(account_ids);
 PERFORM set_config('app.person_purge','on',true);
 UPDATE public.pdv_state SET data=jsonb_set(snapshot,'{orders}',coalesce((SELECT jsonb_agg(o) FROM jsonb_array_elements(coalesce(snapshot->'orders','[]')) o WHERE NOT(o->>'id'=ANY(orders))),'[]')),revision=revision+1,updated_at=now() WHERE id=1;
 PERFORM set_config('app.person_purge','off',true);
 INSERT INTO public.person_purge_cleanup(auth_ids,storage_paths) VALUES(account_ids,paths) RETURNING id INTO cleanup_id;
 RETURN result||jsonb_build_object('cleanup_id',cleanup_id);
END $$;
REVOKE ALL ON FUNCTION public.purge_person_history(text,uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purge_person_history(text,uuid,boolean,text) TO authenticated;