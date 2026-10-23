DO $$ DECLARE actor uuid; prod text; request jsonb; oid text; did uuid; rid uuid; cid uuid; result jsonb; before_count integer; BEGIN
SELECT user_id INTO actor FROM public.user_roles WHERE role='cashier' LIMIT 1; IF actor IS NULL THEN RAISE EXCEPTION 'No cashier account for verification'; END IF;
PERFORM set_config('request.jwt.claim.sub',actor::text,true);
SELECT p->>'id' INTO prod FROM public.pdv_state s,jsonb_array_elements(s.data->'products') p WHERE s.id=1 AND (p->>'active')::boolean AND (p->>'price')::numeric>0 AND (p->>'stock' IS NULL OR (p->>'stock')::integer>0) LIMIT 1;
BEGIN
 oid='delivery-verification-'||gen_random_uuid()::text;
 request=jsonb_build_object('id',oid,'type','Delivery','customer','Verificação de entrega','customerPhone','','items',jsonb_build_array(jsonb_build_object('productId',prod,'qty',1,'note','Teste')),'delivery',jsonb_build_object('address',jsonb_build_object('label','Casa','street','Rua de teste','number','10','neighborhood','Centro','city','','state','','postalCode','','complement','','reference','','latitude','','longitude',''),'paymentMethod','Pix','cashFor',''));
 result=public.submit_pdv_operator_with_contact(request);
 SELECT id INTO did FROM public.delivery_orders WHERE order_id=oid; IF did IS NULL THEN RAISE EXCEPTION 'Delivery capture failed'; END IF;
 result=public.submit_pdv_operator_with_contact(request); SELECT count(*) INTO before_count FROM public.delivery_orders WHERE order_id=oid; IF before_count<>1 THEN RAISE EXCEPTION 'Duplicate delivery'; END IF;
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' LIMIT 1; PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 cid=public.save_delivery_courier(NULL,'Verificação de entregador','',NULL);
 rid=public.save_delivery_route(NULL,'Verificação de rota',cid,'Loja',ARRAY[did]);
 BEGIN PERFORM public.start_delivery_route(rid); RAISE EXCEPTION 'Started unready route'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Started unready route' THEN RAISE; END IF; END;
 UPDATE public.delivery_orders SET status='Pronto para entrega' WHERE id=did;
 PERFORM public.start_delivery_route(rid);
 result=public.read_delivery_board(); IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'deliveries') d WHERE d->>'id'=did::text AND d->>'status'='Em rota') THEN RAISE EXCEPTION 'Route read failed'; END IF;
 PERFORM public.update_delivery_status(did,'Entregue');
 IF NOT EXISTS(SELECT 1 FROM public.delivery_orders WHERE id=did AND delivered_at IS NOT NULL AND status='Entregue') THEN RAISE EXCEPTION 'Delivery completion failed'; END IF;
 RAISE EXCEPTION SQLSTATE 'P0002' USING MESSAGE='Verification rollback';
EXCEPTION WHEN no_data_found THEN NULL;
END;
PERFORM set_config('request.jwt.claim.sub','',true);
END $$;