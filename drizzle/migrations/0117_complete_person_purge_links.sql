DO $patch$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.purge_person_history(text,uuid,boolean,text)'::regprocedure) INTO def;
 def=replace(def,'IF nullif(phone_value,'''') IS NOT NULL THEN phones=array[phone_value]; END IF;','SELECT coalesce(array_agg(DISTINCT phone),''{}'') INTO phones FROM (SELECT phone_value phone UNION SELECT phone FROM public.whatsapp_conversations WHERE customer_id=p_id) x WHERE nullif(phone,'''') IS NOT NULL;');
 def=replace(def,'couriers=array[p_id];','SELECT coalesce(array_agg(id),''{}'') INTO couriers FROM public.delivery_couriers WHERE id=p_id OR user_id=ANY(account_ids);');
 def=replace(def,'WHERE order_id=ANY(orders) OR request_id=ANY(requests) OR phone=ANY(phones);','WHERE order_id=ANY(orders) OR request_id=ANY(requests) OR phone=ANY(phones) OR message_id IN (SELECT id FROM public.whatsapp_messages WHERE phone=ANY(phones) OR order_id=ANY(orders));');
 EXECUTE def;
END $patch$;