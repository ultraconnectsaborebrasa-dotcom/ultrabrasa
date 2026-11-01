CREATE OR REPLACE FUNCTION public.add_pdv_cashier_items(order_id text, items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE snapshot jsonb; target jsonb; item jsonb; prod jsonb; products jsonb; added jsonb := '[]'::jsonb; q int;
BEGIN
 IF NOT public.has_role(auth.uid(),'cashier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF jsonb_typeof(items)<>'array' OR jsonb_array_length(items)=0 OR jsonb_array_length(items)>50 THEN RAISE EXCEPTION 'Itens inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(742019);
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
 SELECT o INTO target FROM jsonb_array_elements(snapshot->'orders') o WHERE o->>'id'=order_id;
 IF target IS NULL OR target->>'status' NOT IN ('aberta','cozinha','pronto') THEN RAISE EXCEPTION 'Comanda não está aberta'; END IF;
 products=snapshot->'products';
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
  q := (item->>'qty')::int;
  IF q IS NULL OR q<1 OR q>99 OR length(coalesce(item->>'note',''))>200 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT p INTO prod FROM jsonb_array_elements(products) p WHERE p->>'id'=item->>'productId' AND coalesce((p->>'active')::boolean,true);
  IF prod IS NULL OR (prod->>'price') IS NULL THEN RAISE EXCEPTION 'Produto indisponível'; END IF;
  IF prod->>'stock' IS NOT NULL AND (prod->>'stock')::numeric < q THEN RAISE EXCEPTION 'Estoque insuficiente: %', prod->>'name'; END IF;
  SELECT jsonb_agg(CASE WHEN p->>'id'=prod->>'id' AND p->>'stock' IS NOT NULL THEN jsonb_set(p,'{stock}',to_jsonb((p->>'stock')::numeric-q)) ELSE p END) INTO products FROM jsonb_array_elements(products) p;
  added := added || jsonb_build_array(jsonb_build_object('uid',substr(md5(random()::text),1,8),'productId',prod->>'id','name',prod->>'name','price',(prod->>'price')::numeric,'qty',q,'note',coalesce(item->>'note','')));
 END LOOP;
 snapshot=jsonb_set(snapshot,'{products}',products);
 SELECT jsonb_set(snapshot,'{orders}',jsonb_agg(CASE WHEN o->>'id'=order_id THEN o||jsonb_build_object('items',(o->'items')||added,'status','cozinha') ELSE o END)) INTO snapshot FROM jsonb_array_elements(snapshot->'orders') o;
 UPDATE public.pdv_state SET data=snapshot,revision=revision+1,updated_at=now() WHERE id=1;
END $function$;
REVOKE ALL ON FUNCTION public.add_pdv_cashier_items(text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_pdv_cashier_items(text,jsonb) TO authenticated;