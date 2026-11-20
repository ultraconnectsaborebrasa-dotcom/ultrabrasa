BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"57775377-15ca-4bd8-9895-4f501c27cd55","role":"authenticated"}', true);

DO $test$
DECLARE result jsonb; created jsonb; delivery_status text; delivery_route uuid;
BEGIN
  result=public.submit_pdv_cashier_direct_paid('{"id":"probe-direct-marmita","source":"desktop","type":"Balcão","customer":"Teste temporário","note":"","items":[{"productId":"product-marmita-completa","qty":1,"note":""}],"promotionConsent":false}'::jsonb, 'Pix');
  IF result->>'status' IS DISTINCT FROM 'retirado' THEN RAISE EXCEPTION 'Marmita paga no balcão não foi finalizada: %', result; END IF;
  SELECT value INTO created FROM public.pdv_state s CROSS JOIN LATERAL jsonb_array_elements(s.data->'orders') value WHERE s.id=1 AND value->>'id'='probe-direct-marmita';
  IF created->>'paymentStatus' IS DISTINCT FROM 'pago' OR jsonb_array_length(coalesce(created->'payments','[]'::jsonb))<>1 THEN RAISE EXCEPTION 'Pagamento direto ausente ou duplicado: %', created; END IF;

  PERFORM public.submit_pdv_operator_with_contact('{"id":"probe-delivery-payment","source":"desktop","type":"Delivery","customer":"Teste temporário","customerPhone":"","note":"","items":[{"productId":"product-marmita-completa","qty":1,"note":""}],"promotionConsent":false,"delivery":{"address":{"label":"Casa","street":"Rua Teste","number":"10","neighborhood":"Centro","city":"Eunápolis","state":"BA","postalCode":"","complement":"","reference":"","latitude":"","longitude":""},"paymentMethod":"Pix","cashFor":"","chargeDeliveryFee":false}}'::jsonb);
  PERFORM public.pay_pdv_kitchen('probe-delivery-payment', 'Pix');
  SELECT value INTO created FROM public.pdv_state s CROSS JOIN LATERAL jsonb_array_elements(s.data->'orders') value WHERE s.id=1 AND value->>'id'='probe-delivery-payment';
  SELECT status,route_id INTO delivery_status,delivery_route FROM public.delivery_orders WHERE order_id='probe-delivery-payment';
  IF created->>'status' IS DISTINCT FROM 'pronto' OR created->>'paymentStatus' IS DISTINCT FROM 'pago' OR jsonb_array_length(coalesce(created->'payments','[]'::jsonb))<>1 THEN RAISE EXCEPTION 'Delivery pago com etapa ou pagamento incorreto: %', created; END IF;
  IF delivery_status IS DISTINCT FROM 'Pronto para entrega' OR delivery_route IS NOT NULL THEN RAISE EXCEPTION 'Pagamento iniciou rota indevidamente: %, rota %', delivery_status, delivery_route; END IF;
END $test$;

SELECT 'Pagamento direto e Delivery sem saída automática: OK' AS result;
ROLLBACK;
