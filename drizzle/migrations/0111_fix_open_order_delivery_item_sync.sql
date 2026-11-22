DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.update_pdv_open_order(text,jsonb,text)'::regprocedure) INTO definition;
 IF position(' UPDATE public.delivery_orders SET items=new_items WHERE order_id=update_pdv_open_order.order_id;' IN definition)=0 THEN RAISE EXCEPTION 'Trecho de sincronização esperado não encontrado'; END IF;
 definition=replace(definition,' UPDATE public.delivery_orders SET items=new_items WHERE order_id=update_pdv_open_order.order_id;','');
 EXECUTE definition;
END $migration$;