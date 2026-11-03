CREATE OR REPLACE FUNCTION public.read_pdv_cashier() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'cashier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 RETURN jsonb_build_object(
 'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','category',p->>'category','price',p->'price','stock',p->'stock','active',p->'active')) FROM jsonb_array_elements(coalesce(snapshot->'products','[]')) p),'[]'),
 'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o->>'id','number',o->'number','type',o->>'type','tableNumber',o->'tableNumber','customer',o->>'customer','status',o->>'status','paymentStatus',o->>'paymentStatus','hasPayment',jsonb_array_length(coalesce(o->'payments','[]'))>0,'createdAt',o->'createdAt','note',o->>'note','total',greatest(0,(SELECT coalesce(sum((i->>'price')::numeric*(i->>'qty')::numeric),0) FROM jsonb_array_elements(o->'items') i)-coalesce((o->>'discount')::numeric,0)+coalesce((o->>'fee')::numeric,0)+coalesce((o->>'serviceAmount')::numeric,0)),'items',(SELECT jsonb_agg(jsonb_build_object('name',i->>'name','qty',i->'qty','price',i->'price','note',i->>'note')) FROM jsonb_array_elements(o->'items') i))) FROM jsonb_array_elements(coalesce(snapshot->'orders','[]')) o WHERE o->>'status' IN ('aberta','cozinha','pronto')),'[]'),
 'deliveryFee',coalesce((snapshot->'settings'->>'deliveryFee')::numeric,0),'paymentMethods',coalesce(snapshot->'settings'->'paymentMethods','[]'));
END $$;
CREATE OR REPLACE FUNCTION public.guard_receipt_double_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o jsonb; prev jsonb;
BEGIN
FOR o IN SELECT value FROM jsonb_array_elements(NEW.data->'orders') LOOP
SELECT value INTO prev FROM jsonb_array_elements(OLD.data->'orders') WHERE value->>'id'=o->>'id';
IF jsonb_array_length(coalesce(prev->'payments','[]'))>0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(prev->'payments') p WHERE p->>'receiptId' IS NOT NULL) AND o->'payments' IS DISTINCT FROM prev->'payments' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(o->'payments','[]')) p WHERE p->>'receiptId' IS NULL) THEN RAISE EXCEPTION 'Pedido já pago por comprovante: use a conferência, sem cobrar novamente'; END IF;
END LOOP;RETURN NEW;END $$;
CREATE TRIGGER receipt_payment_guard BEFORE UPDATE ON public.pdv_state FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_double_payment();