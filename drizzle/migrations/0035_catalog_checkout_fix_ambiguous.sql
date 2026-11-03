CREATE OR REPLACE FUNCTION public.catalog_place_order(_client_key uuid, _order jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.whatsapp_order_requests; snapshot jsonb; line jsonb; p jsonb; total numeric=0; items jsonb='[]'; summary jsonb='[]';
 v_phone text; v_name text; typ text; pay text; addr jsonb; cash numeric; code text; note text; pending uuid; qty int; lnote text; card text;
BEGIN
 PERFORM pg_advisory_xact_lock(742019);
 SELECT * INTO existing FROM public.whatsapp_order_requests WHERE inbound_id='catalog:'||_client_key::text;
 IF existing.id IS NOT NULL THEN RETURN jsonb_build_object('code',existing.public_code,'total',existing.quoted_total,'items',existing.request->'summary','duplicate',true); END IF;
 v_name=btrim(coalesce(_order->>'customer','')); v_phone=regexp_replace(coalesce(_order->>'phone',''),'\D','','g');
 IF length(v_phone) IN (10,11) THEN v_phone='55'||v_phone; END IF;
 IF length(v_name)<2 OR length(v_name)>80 THEN RAISE EXCEPTION 'Informe seu nome'; END IF;
 IF v_phone !~ '^55\d{10,11}$' THEN RAISE EXCEPTION 'Informe um WhatsApp válido com DDD'; END IF;
 typ=_order->>'type'; IF typ NOT IN ('Delivery','Retirada') THEN RAISE EXCEPTION 'Escolha entrega ou retirada'; END IF;
 pay=_order->>'payment'; IF pay NOT IN ('Pix','Crédito','Débito','Dinheiro') THEN RAISE EXCEPTION 'Escolha a forma de pagamento'; END IF;
 addr=jsonb_build_object('street',left(btrim(coalesce(_order->'address'->>'street','')),120),'number',left(btrim(coalesce(_order->'address'->>'number','')),20),'neighborhood',left(btrim(coalesce(_order->'address'->>'neighborhood','')),80),'complement',left(btrim(coalesce(_order->'address'->>'complement','')),120),'reference',left(btrim(coalesce(_order->'address'->>'reference','')),160),'city','Eunápolis');
 IF typ='Delivery' AND (addr->>'street'='' OR addr->>'number'='' OR addr->>'neighborhood'='') THEN RAISE EXCEPTION 'Informe rua, número e bairro'; END IF;
 IF jsonb_typeof(_order->'items')<>'array' OR jsonb_array_length(_order->'items') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Carrinho vazio'; END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 FOR line IN SELECT value FROM jsonb_array_elements(_order->'items') LOOP
  qty=(line->>'qty')::int; IF qty IS NULL OR qty<1 OR qty>99 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  lnote=left(btrim(coalesce(line->>'note','')),200);
  SELECT value INTO p FROM jsonb_array_elements(snapshot->'products') WHERE value->>'id'=line->>'productId';
  IF p IS NULL OR NOT coalesce((p->>'active')::boolean,false) OR coalesce((p->>'price')::numeric,0)<=0
   OR EXISTS(SELECT 1 FROM public.catalog_products c WHERE c.product_id=p->>'id' AND NOT c.published)
   OR (p->>'stock' IS NOT NULL AND (p->>'stock')::numeric<qty) THEN RAISE EXCEPTION 'Item indisponível: %', coalesce(p->>'name','produto'); END IF;
  total=total+(p->>'price')::numeric*qty;
  items=items||jsonb_build_object('productId',p->>'id','qty',qty,'note',lnote,'quotedPrice',(p->>'price')::numeric);
  summary=summary||jsonb_build_object('name',p->>'name','qty',qty,'note',lnote,'price',(p->>'price')::numeric);
 END LOOP;
 cash=0;
 IF pay='Dinheiro' AND coalesce((_order->>'needChange')::boolean,false) THEN cash=(_order->>'cashFor')::numeric; IF cash IS NULL OR cash<=total OR cash>10000 THEN RAISE EXCEPTION 'Troco: informe um valor maior que o total'; END IF; END IF;
 SELECT id INTO pending FROM public.whatsapp_order_requests WHERE phone=v_phone AND status='awaiting_acceptance';
 IF pending IS NOT NULL THEN RAISE EXCEPTION 'Já existe um pedido seu aguardando confirmação da loja. Fale conosco pelo WhatsApp.'; END IF;
 code='C'||nextval('public.catalog_order_code_seq');
 card=CASE WHEN pay IN ('Crédito','Débito') THEN 'Cartão' ELSE pay END;
 note=concat_ws(' · ','Catálogo digital — pedido '||code, CASE WHEN btrim(coalesce(_order->>'requestedTime',''))<>'' THEN 'Horário solicitado: '||left(_order->>'requestedTime',40) END,
  'Pagamento na '||CASE WHEN typ='Delivery' THEN 'entrega' ELSE 'retirada' END||' (pendente): '||pay,
  CASE WHEN card='Cartão' AND typ='Delivery' THEN 'Levar maquininha' END, CASE WHEN cash>0 THEN 'Troco para R$ '||to_char(cash,'FM999990.00') END,
  CASE WHEN btrim(coalesce(_order->>'note',''))<>'' THEN left(_order->>'note',300) END);
 INSERT INTO public.whatsapp_conversations(phone,name,last_message,last_message_at) VALUES(v_phone,v_name,'Pedido '||code||' pelo catálogo',now())
  ON CONFLICT(phone) DO UPDATE SET name=coalesce(public.whatsapp_conversations.name,EXCLUDED.name),last_message=EXCLUDED.last_message,last_message_at=now();
 INSERT INTO public.whatsapp_order_requests(phone,inbound_id,request,quoted_total,public_code,source)
  VALUES(v_phone,'catalog:'||_client_key::text,jsonb_build_object('customer',v_name,'type',typ,'items',items,'summary',summary,'note',note,'payment',pay,'delivery',jsonb_build_object('address',addr,'paymentMethod',card,'cashFor',cash,'chargeDeliveryFee',false)),total,code,'catalog');
 UPDATE public.whatsapp_conversations SET automation_paused=true,attendance_status=CASE WHEN attendance_status='in_service' THEN attendance_status ELSE 'new' END,draft='{}',draft_version=draft_version+1 WHERE whatsapp_conversations.phone=v_phone;
 RETURN jsonb_build_object('code',code,'total',total,'items',summary,'duplicate',false);
END $$;