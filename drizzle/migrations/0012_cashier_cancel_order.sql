CREATE FUNCTION public.cancel_pdv_cashier_order(order_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; target jsonb; item jsonb; products jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'cashier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT o INTO target FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'id'=order_id;
 IF target IS NULL OR target->>'status' NOT IN ('aberta','cozinha','pronto') THEN RAISE EXCEPTION 'Comanda não pode ser cancelada'; END IF;
 products=snapshot->'products';
 FOR item IN SELECT value FROM jsonb_array_elements(target->'items') LOOP
  SELECT jsonb_agg(CASE WHEN p->>'id'=item->>'productId' AND p->>'stock' IS NOT NULL THEN jsonb_set(p,'{stock}',to_jsonb((p->>'stock')::numeric+(item->>'qty')::numeric)) ELSE p END) INTO products FROM jsonb_array_elements(products) p;
 END LOOP;
 snapshot=jsonb_set(snapshot,'{products}',products);
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN o->>'id'=order_id THEN o||jsonb_build_object('status','cancelado','cancelledBy',auth.uid()::text) ELSE o END)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') o;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION public.cancel_pdv_cashier_order(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_pdv_cashier_order(text) TO authenticated;