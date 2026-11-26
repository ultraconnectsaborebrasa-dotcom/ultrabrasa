-- Transactional integration test: all fixtures and updates are rolled back.
BEGIN;
SELECT pg_advisory_xact_lock(742024);
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1),true);
DO $$
DECLARE driver uuid:=gen_random_uuid(); morning uuid:=gen_random_uuid(); night uuid:=gen_random_uuid(); paid_delivery uuid:=gen_random_uuid(); unpaid_delivery uuid:=gen_random_uuid(); result jsonb; today date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 INSERT INTO public.delivery_couriers(id,name,phone,operational_status) VALUES(driver,'Teste de fechamento de turno','00000000000','unavailable');
 INSERT INTO public.courier_time_entries(id,courier_id,user_id,shift_date,shift_code,scheduled_start,scheduled_end,entry_at) VALUES(morning,driver,auth.uid(),today,'morning','11:00','14:00',now()-interval '10 minutes');
 UPDATE public.pdv_state SET data=jsonb_set(data,'{orders}',coalesce(data->'orders','[]')||jsonb_build_array(
 jsonb_build_object('id','shift-closure-paid-test','number',999901,'type','Balcão','status','entrega','createdAt',(extract(epoch FROM now())*1000)::bigint,'paidAt',(extract(epoch FROM now())*1000)::bigint,'paymentStatus','pago','items',jsonb_build_array(jsonb_build_object('productId','shift-test','name','Teste','qty',1,'price',40)),'payments',jsonb_build_array(jsonb_build_object('method','Dinheiro','amount',40))),
 jsonb_build_object('id','shift-closure-unpaid-test','number',999902,'type','Balcão','status','entrega','createdAt',(extract(epoch FROM now())*1000)::bigint,'paymentStatus','pendente','items',jsonb_build_array(jsonb_build_object('productId','shift-test','name','Teste','qty',1,'price',19.9)),'payments','[]'::jsonb))) WHERE id=1;
 INSERT INTO public.delivery_orders(id,order_id,customer,phone,address,payment_method,cash_for,status,assigned_courier_id,departed_at) VALUES
 (paid_delivery,'shift-closure-paid-test','Teste pago','00000000000','{}','Dinheiro',0,'Em rota',driver,now()-interval '5 minutes'),
 (unpaid_delivery,'shift-closure-unpaid-test','Teste pendente','00000000000','{}','Dinheiro',0,'Em rota',driver,now()-interval '5 minutes'),
 (gen_random_uuid(),'shift-closure-preparing-test','Teste em preparo','00000000000','{}','Dinheiro',0,'Aguardando preparo',driver,NULL);
 UPDATE public.courier_time_entries SET exit_at=now() WHERE id=morning;
 IF (SELECT count(*) FROM public.delivery_orders WHERE id IN(paid_delivery,unpaid_delivery) AND status='Pronto para entrega' AND assigned_courier_id IS NULL AND route_id IS NULL)<>2 THEN RAISE EXCEPTION 'Closure failed to release unfinished deliveries'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_orders WHERE order_id='shift-closure-preparing-test' AND status='Aguardando preparo' AND assigned_courier_id IS NULL AND route_id IS NULL) THEN RAISE EXCEPTION 'Closure prematurely completed preparation'; END IF;
 IF (SELECT operational_status FROM public.delivery_couriers WHERE id=driver)<>'unavailable' THEN RAISE EXCEPTION 'Closed courier remains available'; END IF;
 IF EXISTS(SELECT 1 FROM public.courier_locations WHERE courier_id=driver) THEN RAISE EXCEPTION 'Closed courier remains on map'; END IF;
 INSERT INTO public.courier_time_entries(id,courier_id,user_id,shift_date,shift_code,scheduled_start,scheduled_end) VALUES(night,driver,auth.uid(),today,'night','18:00','22:00');
 UPDATE public.delivery_orders SET assigned_courier_id=driver WHERE id IN(paid_delivery,unpaid_delivery);
 SELECT public.read_courier_settlement(today) INTO result;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result) r WHERE r->>'order_id'='shift-closure-paid-test' AND r->>'shift_id'=morning::text AND r->>'category'='cash' AND (r->>'amount')::numeric=40) THEN RAISE EXCEPTION 'Received cash moved out of original shift'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result) r WHERE r->>'order_id'='shift-closure-paid-test' AND r->>'shift_id'=night::text) THEN RAISE EXCEPTION 'Night settlement includes morning cash'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result) r WHERE r->>'order_id'='shift-closure-unpaid-test' AND r->>'shift_id'=night::text AND r->>'category'='pending' AND (r->>'amount')::numeric=19.9) THEN RAISE EXCEPTION 'Reassigned unpaid delivery is not pending in new shift'; END IF;
 IF (SELECT jsonb_array_length(o->'payments') FROM public.pdv_state s CROSS JOIN LATERAL jsonb_array_elements(s.data->'orders') o WHERE s.id=1 AND o->>'id'='shift-closure-unpaid-test')<>0 THEN RAISE EXCEPTION 'Closure created an automatic payment'; END IF;
END $$;
ROLLBACK;