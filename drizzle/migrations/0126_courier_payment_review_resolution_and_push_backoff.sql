ALTER TABLE public.delivery_orders ADD COLUMN customer_paid_rejected_at timestamptz, ADD COLUMN customer_paid_rejected_by uuid;
CREATE FUNCTION public.reject_delivery_customer_paid(p_order_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.delivery_staff() THEN RAISE EXCEPTION 'Somente Caixa ou Administrador pode conferir'; END IF;
 PERFORM 1 FROM public.pdv_state WHERE id=1 FOR UPDATE;
 UPDATE public.delivery_orders SET customer_paid_rejected_at=now(),customer_paid_rejected_by=auth.uid() WHERE order_id=p_order_id AND customer_paid_reported_at IS NOT NULL AND status<>'Cancelado' AND NOT EXISTS(SELECT 1 FROM public.pdv_state s CROSS JOIN LATERAL jsonb_array_elements(s.data->'orders') o WHERE s.id=1 AND o->>'id'=p_order_id AND (o->>'paymentStatus'='pago' OR jsonb_array_length(coalesce(o->'payments','[]'))>0));
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido já pago, cancelado ou sem aviso'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.reject_delivery_customer_paid(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reject_delivery_customer_paid(text) TO authenticated;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.report_delivery_customer_paid(text)'::regprocedure) INTO definition;
 definition=replace(definition,'SELECT value INTO o FROM public.pdv_state s','PERFORM 1 FROM public.pdv_state WHERE id=1 FOR UPDATE; SELECT value INTO o FROM public.pdv_state s');
 definition=replace(definition,'customer_paid_reported_at=coalesce(customer_paid_reported_at,now()),customer_paid_reported_by=coalesce(customer_paid_reported_by,auth.uid())','customer_paid_reported_at=CASE WHEN customer_paid_rejected_at>=customer_paid_reported_at THEN now() ELSE coalesce(customer_paid_reported_at,now()) END,customer_paid_reported_by=auth.uid()'); EXECUTE definition;
 SELECT pg_get_functiondef('public.read_delivery_payment_review(date)'::regprocedure) INTO definition;
 definition=replace(definition,'''customer_paid_reported_at'',d.customer_paid_reported_at','''customer_paid_reported_at'',CASE WHEN d.customer_paid_rejected_at>=d.customer_paid_reported_at THEN NULL ELSE d.customer_paid_reported_at END'); EXECUTE definition;
 SELECT pg_get_functiondef('public.guard_customer_paid_review()'::regprocedure) INTO definition;
 definition=replace(definition,'d.customer_paid_reported_at IS NOT NULL AND','d.customer_paid_reported_at IS NOT NULL AND (d.customer_paid_rejected_at IS NULL OR d.customer_paid_reported_at>d.customer_paid_rejected_at) AND'); EXECUTE definition;
 SELECT pg_get_functiondef('public.lease_courier_push_jobs()'::regprocedure) INTO definition;
 definition=replace(definition,'WHERE j.state=''pending'' AND coalesce','WHERE j.state=''pending'' AND (j.leased_at IS NULL OR j.leased_at<now()-interval ''1 minute'') AND coalesce'); EXECUTE definition;
END $$;