CREATE OR REPLACE FUNCTION public.restore_cancelled_delivery_marmitas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE mv public.courier_marmita_movements; reason_text text; stock_row public.courier_marmita_stock;
BEGIN
 SELECT * INTO mv FROM public.courier_marmita_movements WHERE delivery_id=NEW.id AND kind='delivery';
 IF mv.id IS NULL THEN RETURN NEW; END IF;
 reason_text='Pedido cancelado '||NEW.order_id;
 IF EXISTS(SELECT 1 FROM public.courier_marmita_movements WHERE courier_id=mv.courier_id AND kind='return' AND reason=reason_text) THEN RETURN NEW; END IF;
 SELECT * INTO stock_row FROM public.courier_marmita_stock WHERE courier_id=mv.courier_id FOR UPDATE;
 IF stock_row.courier_id IS NULL OR stock_row.journey_id IS DISTINCT FROM mv.journey_id THEN RETURN NEW; END IF;
 UPDATE public.courier_marmita_stock SET remaining_quantity=remaining_quantity-mv.quantity_change,
  journey_status=CASE WHEN journey_status='empty' THEN 'active' ELSE journey_status END, updated_at=now(), updated_by=auth.uid()
  WHERE courier_id=mv.courier_id;
 INSERT INTO public.courier_marmita_movements(courier_id,quantity_change,resulting_quantity,kind,actor_id,journey_id,load_id,product_id,reason)
 VALUES(mv.courier_id,-mv.quantity_change,stock_row.remaining_quantity-mv.quantity_change,'return',auth.uid(),mv.journey_id,mv.load_id,mv.product_id,reason_text);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.restore_cancelled_delivery_marmitas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS courier_marmita_cancel_restore ON public.delivery_orders;
CREATE TRIGGER courier_marmita_cancel_restore AFTER UPDATE OF status ON public.delivery_orders
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status='Cancelado')
EXECUTE FUNCTION public.restore_cancelled_delivery_marmitas();

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
INSERT INTO public.delivery_orders(order_id,customer_id,customer,phone,address,payment_method,cash_for,created_at,status) VALUES(o->>'id',cid,coalesce(o->>'customer',''),coalesce(o->>'customerPhone',''),a,coalesce(o->'delivery'->>'paymentMethod','Pix'),coalesce(nullif(o->'delivery'->>'cashFor',''),'0')::numeric,to_timestamp((o->>'createdAt')::numeric/1000),CASE WHEN o->>'status'='cancelado' THEN 'Cancelado' WHEN o->>'status' IN ('pronto','pago','entregue') THEN 'Pronto para entrega' ELSE 'Aguardando preparo' END) ON CONFLICT(order_id) DO UPDATE SET customer=EXCLUDED.customer,phone=EXCLUDED.phone,address=EXCLUDED.address,payment_method=EXCLUDED.payment_method,cash_for=EXCLUDED.cash_for;
END IF;
IF o->>'status'='cancelado' THEN
 UPDATE public.delivery_orders SET status='Cancelado', route_id=NULL, assigned_courier_id=NULL
  WHERE order_id=o->>'id' AND (status<>'Cancelado' OR route_id IS NOT NULL OR assigned_courier_id IS NOT NULL);
ELSE
 UPDATE public.delivery_orders SET status='Pronto para entrega'
  WHERE order_id=o->>'id' AND o->>'status' IN ('pronto','pago','entregue') AND status='Aguardando preparo';
END IF;
END LOOP; RETURN NEW; END $function$;

UPDATE public.delivery_orders d SET route_id=NULL, assigned_courier_id=NULL
 WHERE d.status='Cancelado' AND (d.route_id IS NOT NULL OR d.assigned_courier_id IS NOT NULL);