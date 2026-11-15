CREATE OR REPLACE FUNCTION public.wa_edit_request(_id uuid, _patch jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.whatsapp_order_requests; snapshot jsonb; req jsonb; line jsonb; p jsonb; items jsonb='[]'; summ jsonb='[]'; total numeric=0; q int; addr jsonb;
BEGIN
IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
SELECT * INTO r FROM public.whatsapp_order_requests WHERE id=_id FOR UPDATE;
IF r.id IS NULL OR r.status<>'awaiting_acceptance' THEN RAISE EXCEPTION 'Pedido não está aguardando aceite'; END IF;
SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
req=r.request;
IF length(trim(coalesce(_patch->>'customer','')))<2 THEN RAISE EXCEPTION 'Informe o nome'; END IF;
req=jsonb_set(req,'{customer}',to_jsonb(left(trim(_patch->>'customer'),120)));
req=jsonb_set(req,'{payment}',to_jsonb(left(coalesce(_patch->>'payment',''),40)));
req=jsonb_set(req,'{note}',to_jsonb(left(coalesce(_patch->>'note',''),1000)));
IF req->>'type'='Delivery' THEN
 addr=coalesce(req->'delivery'->'address','{}')||jsonb_build_object('street',left(trim(coalesce(_patch->'address'->>'street','')),160),'number',left(trim(coalesce(_patch->'address'->>'number','')),20),'neighborhood',left(trim(coalesce(_patch->'address'->>'neighborhood','')),120),'reference',left(trim(coalesce(_patch->'address'->>'reference','')),200));
 IF addr->>'street'='' OR addr->>'number'='' OR addr->>'neighborhood'='' THEN RAISE EXCEPTION 'Informe rua, número e bairro'; END IF;
 req=jsonb_set(req,'{delivery,address}',addr,true);
 req=jsonb_set(req,'{delivery,paymentMethod}',to_jsonb(req->>'payment'),true);
END IF;
FOR line IN SELECT value FROM jsonb_array_elements(_patch->'items') LOOP
 q=(line->>'qty')::int; IF q IS NULL OR q<0 OR q>50 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF; CONTINUE WHEN q=0;
 SELECT value INTO p FROM jsonb_array_elements(snapshot->'products') WHERE value->>'id'=line->>'productId';
 IF p IS NULL OR NOT coalesce((p->>'active')::boolean,false) THEN RAISE EXCEPTION 'Produto indisponível'; END IF;
 items=items||jsonb_build_array(jsonb_build_object('productId',p->>'id','qty',q,'note',left(coalesce(line->>'note',''),300),'quotedPrice',(p->>'price')::numeric));
 summ=summ||jsonb_build_array(jsonb_build_object('productId',p->>'id','name',p->>'name','qty',q,'note',left(coalesce(line->>'note',''),300),'price',(p->>'price')::numeric));
 total=total+(p->>'price')::numeric*q;
END LOOP;
IF jsonb_array_length(items)=0 THEN RAISE EXCEPTION 'O pedido precisa de ao menos um item'; END IF;
req=jsonb_set(jsonb_set(req,'{items}',items),'{summary}',summ);
UPDATE public.whatsapp_order_requests SET request=req,quoted_total=round(total,2),updated_at=now() WHERE id=_id;
RETURN jsonb_build_object('total',round(total,2));
END $$;
REVOKE ALL ON FUNCTION public.wa_edit_request(uuid,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wa_edit_request(uuid,jsonb) TO authenticated;