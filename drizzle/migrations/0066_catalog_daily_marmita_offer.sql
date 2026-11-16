INSERT INTO public.catalog_settings(id,config)
SELECT 1,jsonb_build_object('dailyOffer',jsonb_build_object(
  'productId','product-marmita-completa',
  'title','Cardápio de hoje',
  'description','Churrasco, carne assada e linguiça de frango',
  'accompaniments',jsonb_build_array('Arroz','Farofa de feijão','Macarrão','Salada'),
  'active',true
))
WHERE NOT EXISTS(SELECT 1 FROM public.catalog_settings WHERE id=1);

UPDATE public.catalog_settings
SET config=jsonb_set(coalesce(config,'{}'::jsonb),'{dailyOffer}',coalesce(config->'dailyOffer',jsonb_build_object(
  'productId','product-marmita-completa',
  'title','Cardápio de hoje',
  'description','Churrasco, carne assada e linguiça de frango',
  'accompaniments',jsonb_build_array('Arroz','Farofa de feijão','Macarrão','Salada'),
  'active',true
)),true),updated_at=now()
WHERE id=1 AND config->'dailyOffer' IS NULL;

CREATE OR REPLACE FUNCTION public.read_public_catalog()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'settings', (SELECT config FROM catalog_settings WHERE id = 1),
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p->>'id', 'name', p->>'name', 'category', p->>'category',
        'price', (p->>'price')::numeric,
        'available', (p->>'stock') IS NULL OR (p->>'stock')::numeric > 0,
        'description', COALESCE(c.description, ''), 'image', c.image_url,
        'illustrative', COALESCE(c.illustrative, true), 'featured', COALESCE(c.featured, false),
        'sort', COALESCE(c.sort, 0)
      ) ORDER BY COALESCE(c.sort,0), p->>'name')
      FROM pdv_state s, jsonb_array_elements(s.data->'products') p
      LEFT JOIN catalog_products c ON c.product_id = p->>'id'
      WHERE s.id = 1 AND COALESCE((p->>'active')::boolean, true)
        AND COALESCE(c.published, true) AND COALESCE((p->>'price')::numeric,0) > 0
    ), '[]'::jsonb),
    'dailyOffer', (
      SELECT jsonb_build_object(
        'productId',p.product->>'id',
        'name',p.product->>'name',
        'title',cs.config->'dailyOffer'->>'title',
        'description',cs.config->'dailyOffer'->>'description',
        'accompaniments',coalesce(cs.config->'dailyOffer'->'accompaniments','[]'::jsonb),
        'active',coalesce((cs.config->'dailyOffer'->>'active')::boolean,false),
        'price',(p.product->>'price')::numeric,
        'stock',p.product->'stock',
        'minStock',coalesce((p.product->>'minStock')::integer,0),
        'available',coalesce((p.product->>'active')::boolean,true)
          AND coalesce(c.published,true)
          AND coalesce((p.product->>'price')::numeric,0)>0
          AND (p.product->'stock' IS NULL OR (p.product->>'stock')::numeric>0),
        'image',c.image_url
      )
      FROM catalog_settings cs
      CROSS JOIN pdv_state s
      CROSS JOIN LATERAL (
        SELECT value AS product FROM jsonb_array_elements(s.data->'products')
        WHERE value->>'id'=cs.config->'dailyOffer'->>'productId' LIMIT 1
      ) p
      LEFT JOIN catalog_products c ON c.product_id=p.product->>'id'
      WHERE cs.id=1 AND s.id=1 AND cs.config->'dailyOffer' IS NOT NULL
    )
  )
$$;
REVOKE ALL ON FUNCTION public.read_public_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_public_catalog() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_catalog_daily_offer(_input jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_product_id text;
  v_title text;
  v_description text;
  v_accompaniments jsonb;
  v_full_description text;
  v_active boolean;
  v_product_available boolean;
  v_price numeric;
  v_stock integer;
  v_min_stock integer;
  v_snapshot jsonb;
  v_product jsonb;
  v_products jsonb;
  v_offer jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administrador'; END IF;
  v_product_id=btrim(coalesce(_input->>'productId',''));
  v_title=btrim(coalesce(_input->>'title',''));
  v_description=btrim(coalesce(_input->>'description',''));
  v_active=coalesce((_input->>'active')::boolean,false);
  v_product_available=coalesce((_input->>'productAvailable')::boolean,true);
  v_price=(_input->>'price')::numeric;
  v_stock=CASE WHEN jsonb_typeof(_input->'stock')='null' THEN NULL ELSE (_input->>'stock')::integer END;
  v_min_stock=coalesce((_input->>'minStock')::integer,0);
  IF length(v_title) NOT BETWEEN 2 AND 80 OR length(v_description) NOT BETWEEN 2 AND 300 THEN RAISE EXCEPTION 'Preencha título e descrição da oferta'; END IF;
  IF v_price IS NULL OR v_price<=0 OR v_price>1000000 OR (v_stock IS NOT NULL AND v_stock NOT BETWEEN 0 AND 1000000) OR v_min_stock NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'Preço ou estoque inválido'; END IF;
  IF jsonb_typeof(_input->'accompaniments') IS DISTINCT FROM 'array' OR jsonb_array_length(_input->'accompaniments') NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Informe os acompanhamentos'; END IF;
  SELECT jsonb_agg(btrim(value)) INTO v_accompaniments FROM jsonb_array_elements_text(_input->'accompaniments');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_accompaniments) value WHERE length(value) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'Acompanhamento inválido'; END IF;
  SELECT string_agg(value,', ') INTO v_full_description FROM jsonb_array_elements_text(v_accompaniments) value;
  v_full_description=v_description||'. Acompanha: '||v_full_description||'.';
  IF length(v_full_description)>400 THEN RAISE EXCEPTION 'Descrição e acompanhamentos devem ter até 400 caracteres'; END IF;

  PERFORM pg_advisory_xact_lock(742019);
  SELECT data INTO v_snapshot FROM public.pdv_state WHERE id=1 FOR UPDATE;
  SELECT value INTO v_product FROM jsonb_array_elements(v_snapshot->'products') WHERE value->>'id'=v_product_id;
  IF v_product IS NULL OR lower(btrim(v_product->>'category'))<>'marmitas' THEN RAISE EXCEPTION 'Escolha uma marmita cadastrada no PDV'; END IF;
  SELECT jsonb_agg(CASE WHEN value->>'id'=v_product_id THEN value||jsonb_build_object('price',v_price,'stock',v_stock,'minStock',v_min_stock,'active',v_product_available) ELSE value END)
    INTO v_products FROM jsonb_array_elements(v_snapshot->'products');
  v_snapshot=jsonb_set(v_snapshot,'{products}',v_products);
  UPDATE public.pdv_state SET data=v_snapshot,revision=revision+1,updated_at=now() WHERE id=1;

  v_offer=jsonb_build_object('productId',v_product_id,'title',v_title,'description',v_description,'accompaniments',v_accompaniments,'active',v_active);
  INSERT INTO public.catalog_settings(id,config,updated_at) VALUES(1,jsonb_build_object('dailyOffer',v_offer),now())
  ON CONFLICT(id) DO UPDATE SET config=coalesce(public.catalog_settings.config,'{}'::jsonb)||jsonb_build_object('dailyOffer',v_offer),updated_at=now();
  INSERT INTO public.catalog_products(product_id,description,updated_at) VALUES(v_product_id,v_full_description,now())
  ON CONFLICT(product_id) DO UPDATE SET description=EXCLUDED.description,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_catalog_daily_offer(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_catalog_daily_offer(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.catalog_place_order(_client_key uuid, _order jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.whatsapp_order_requests; snapshot jsonb; line jsonb; p jsonb; total numeric=0; items jsonb='[]'; summary jsonb='[]';
 v_phone text; v_name text; typ text; pay text; addr jsonb; cash numeric; code text; note text; pending uuid; qty int; lnote text; card text; channel text; daily jsonb;
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
 channel=coalesce(_order->>'channel','catalog');
 IF channel NOT IN ('catalog','daily-menu') THEN RAISE EXCEPTION 'Origem do pedido inválida'; END IF;
 IF channel='daily-menu' THEN
  SELECT config->'dailyOffer' INTO daily FROM public.catalog_settings WHERE id=1;
  IF daily IS NULL OR NOT coalesce((daily->>'active')::boolean,false) THEN RAISE EXCEPTION 'Oferta indisponível no momento'; END IF;
 END IF;
 SELECT data INTO snapshot FROM public.pdv_state WHERE id=1;
 FOR line IN SELECT value FROM jsonb_array_elements(_order->'items') LOOP
  qty=(line->>'qty')::int; IF qty IS NULL OR qty<1 OR qty>99 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  lnote=left(btrim(coalesce(line->>'note','')),200);
  SELECT value INTO p FROM jsonb_array_elements(snapshot->'products') WHERE value->>'id'=line->>'productId';
  IF channel='daily-menu' AND (p IS NULL OR p->>'id'<>daily->>'productId') THEN RAISE EXCEPTION 'Item não pertence à oferta do dia'; END IF;
  IF p IS NULL OR NOT coalesce((p->>'active')::boolean,false) OR coalesce((p->>'price')::numeric,0)<=0
   OR EXISTS(SELECT 1 FROM public.catalog_products c WHERE c.product_id=p->>'id' AND NOT c.published)
   OR (p->>'stock' IS NOT NULL AND (p->>'stock')::numeric<qty) THEN RAISE EXCEPTION 'Item indisponível: %', coalesce(p->>'name','produto'); END IF;
  IF lower(btrim(p->>'category'))='marmitas' AND ((now() AT TIME ZONE 'America/Bahia')::time >= time '14:00' OR (now() AT TIME ZONE 'America/Bahia')::time < time '09:00') THEN RAISE EXCEPTION 'Marmitas disponíveis das 09:00 às 14:00'; END IF;
  IF lower(btrim(p->>'category')) IN ('hambúrgueres','espetinhos','acompanhamentos') AND (now() AT TIME ZONE 'America/Bahia')::time < time '17:00' THEN RAISE EXCEPTION 'Hambúrgueres, espetinhos e acompanhamentos disponíveis a partir das 17:00; preparo a partir das 18:00'; END IF;
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
 note=concat_ws(' · ',CASE WHEN channel='daily-menu' THEN 'Marmita do Dia — cardápio público — pedido '||code ELSE 'Catálogo digital — pedido '||code END, CASE WHEN btrim(coalesce(_order->>'requestedTime',''))<>'' THEN 'Horário solicitado: '||left(_order->>'requestedTime',40) END,
  'Pagamento na '||CASE WHEN typ='Delivery' THEN 'entrega' ELSE 'retirada' END||' (pendente): '||pay,
  CASE WHEN card='Cartão' AND typ='Delivery' THEN 'Levar maquininha' END, CASE WHEN cash>0 THEN 'Troco para R$ '||to_char(cash,'FM999990.00') END,
  CASE WHEN btrim(coalesce(_order->>'note',''))<>'' THEN left(_order->>'note',300) END);
 INSERT INTO public.whatsapp_conversations(phone,name,last_message,last_message_at) VALUES(v_phone,v_name,'Pedido '||code||' pelo catálogo',now())
  ON CONFLICT(phone) DO UPDATE SET name=coalesce(public.whatsapp_conversations.name,EXCLUDED.name),last_message=EXCLUDED.last_message,last_message_at=now();
 INSERT INTO public.whatsapp_order_requests(phone,inbound_id,request,quoted_total,public_code,source)
  VALUES(v_phone,'catalog:'||_client_key::text,jsonb_build_object('customer',v_name,'type',typ,'items',items,'summary',summary,'note',note,'payment',pay,'origin',channel,'delivery',jsonb_build_object('address',addr,'paymentMethod',card,'cashFor',cash,'chargeDeliveryFee',false)),total,code,'catalog');
 UPDATE public.whatsapp_conversations SET automation_paused=true,attendance_status=CASE WHEN attendance_status='in_service' THEN attendance_status ELSE 'new' END,draft='{}',draft_version=draft_version+1 WHERE whatsapp_conversations.phone=v_phone;
 RETURN jsonb_build_object('code',code,'total',total,'items',summary,'duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.catalog_place_order(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_place_order(uuid,jsonb) TO anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE public.catalog_order_code_seq TO service_role;

DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.submit_pdv_operator(jsonb)'::regprocedure);
 IF position('''source'',CASE WHEN request->>''source''=''mobile'' THEN ''mobile'' ELSE ''desktop'' END' IN d)=0 THEN RAISE EXCEPTION 'PDV source insertion point missing'; END IF;
 d:=replace(d,'''source'',CASE WHEN request->>''source''=''mobile'' THEN ''mobile'' ELSE ''desktop'' END','''source'',CASE WHEN request->>''source''=''mobile'' THEN ''mobile'' WHEN request->>''source''=''catalog'' THEN ''catalog'' ELSE ''desktop'' END');
 EXECUTE d;
 d:=pg_get_functiondef('public.wa_accept_request(uuid)'::regprocedure);
 IF position('req=r.request||jsonb_build_object(''id'',oid,''customerPhone'',r.phone,''source'',''desktop'');' IN d)=0 THEN RAISE EXCEPTION 'Catalog acceptance source insertion point missing'; END IF;
 d:=replace(d,'req=r.request||jsonb_build_object(''id'',oid,''customerPhone'',r.phone,''source'',''desktop'');','req=r.request||jsonb_build_object(''id'',oid,''customerPhone'',r.phone,''source'',CASE WHEN r.source=''catalog'' THEN ''catalog'' ELSE ''desktop'' END);');
 EXECUTE d;
END $$;