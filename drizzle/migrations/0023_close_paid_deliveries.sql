CREATE OR REPLACE FUNCTION public.sync_pdv_deliveries()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE o jsonb; prev jsonb; cid uuid; digits text; a jsonb; BEGIN
FOR o IN SELECT value FROM jsonb_array_elements(NEW.data->'orders') WHERE value->>'type'='Delivery' LOOP
SELECT value INTO prev FROM jsonb_array_elements(coalesce(OLD.data->'orders','[]')) WHERE value->>'id'=o->>'id';
IF prev IS NULL OR o->'delivery' IS DISTINCT FROM prev->'delivery' THEN
PERFORM public.validate_delivery_input(o->'delivery'); a=o->'delivery'->'address'; cid=nullif(o->>'customerId','')::uuid;
IF cid IS NULL THEN digits=regexp_replace(coalesce(o->>'customerPhone',''),'[^0-9]','','g'); IF length(digits) IN (10,11) THEN digits='55'||digits; END IF;
IF digits<>'' AND digits !~ '^[1-9][0-9]{9,14}$' THEN RAISE EXCEPTION 'WhatsApp inválido'; END IF;
IF digits<>'' THEN INSERT INTO public.pdv_customers(name,phone) VALUES(left(coalesce(o->>'customer',''),120),digits) ON CONFLICT(phone) DO UPDATE SET updated_at=now() RETURNING id INTO cid;
ELSE INSERT INTO public.pdv_customers(name) VALUES(left(coalesce(o->>'customer',''),120)) RETURNING id INTO cid; END IF; END IF;
IF NOT EXISTS(SELECT 1 FROM public.delivery_addresses WHERE customer_id=cid AND address=a) THEN INSERT INTO public.delivery_addresses(customer_id,address) VALUES(cid,a); END IF;
INSERT INTO public.delivery_orders(order_id,customer_id,customer,phone,address,payment_method,cash_for,created_at,status) VALUES(o->>'id',cid,coalesce(o->>'customer',''),coalesce(o->>'customerPhone',''),a,coalesce(o->'delivery'->>'paymentMethod','Pix'),coalesce(nullif(o->'delivery'->>'cashFor',''),'0')::numeric,to_timestamp((o->>'createdAt')::numeric/1000),CASE WHEN o->>'status'='cancelado' THEN 'Cancelado' WHEN o->>'status'='pronto' THEN 'Pronto para entrega' ELSE 'Aguardando preparo' END) ON CONFLICT(order_id) DO UPDATE SET customer=EXCLUDED.customer,phone=EXCLUDED.phone,address=EXCLUDED.address,payment_method=EXCLUDED.payment_method,cash_for=EXCLUDED.cash_for;
END IF;
UPDATE public.delivery_orders SET status=CASE WHEN o->>'status'='cancelado' THEN 'Cancelado' WHEN o->>'status' IN ('pago','entregue') THEN 'Entregue' ELSE 'Pronto para entrega' END,
 delivered_at=CASE WHEN o->>'status' IN ('pago','entregue') THEN coalesce(delivered_at,now()) ELSE delivered_at END
 WHERE order_id=o->>'id' AND ((o->>'status'='cancelado' AND status<>'Entregue') OR (o->>'status'='pronto' AND status='Aguardando preparo') OR (o->>'status' IN ('pago','entregue') AND status NOT IN ('Entregue','Cancelado')));
END LOOP; RETURN NEW; END $function$;

UPDATE public.delivery_orders d SET status='Entregue', delivered_at=coalesce(d.delivered_at,now())
FROM public.pdv_state s, jsonb_array_elements(s.data->'orders') o
WHERE o->>'id'=d.order_id AND o->>'status' IN ('pago','entregue') AND d.status NOT IN ('Entregue','Cancelado');