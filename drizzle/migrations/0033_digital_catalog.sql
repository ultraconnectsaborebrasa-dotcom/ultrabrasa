CREATE TABLE public.catalog_products (
  product_id text PRIMARY KEY,
  description text NOT NULL DEFAULT '',
  image_url text,
  illustrative boolean NOT NULL DEFAULT true,
  published boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalog_products TO authenticated;
GRANT ALL ON public.catalog_products TO service_role;
ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_products_staff_read ON public.catalog_products FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));

CREATE TABLE public.catalog_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalog_settings TO authenticated;
GRANT ALL ON public.catalog_settings TO service_role;
ALTER TABLE public.catalog_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_settings_staff_read ON public.catalog_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));
INSERT INTO public.catalog_settings (id, config) VALUES (1, '{"lunchStart":"10:00","lunchEnd":"15:00","nightStart":"18:00","nightEnd":"23:30","deliveryStart":"11:00","freeDeliveryEunapolis":true}'::jsonb);

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
    ), '[]'::jsonb)
  )
$$;
REVOKE ALL ON FUNCTION public.read_public_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_public_catalog() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_catalog_product(_product_id text, _description text, _image_url text, _illustrative boolean, _published boolean, _featured boolean, _sort integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administrador'; END IF;
  IF length(COALESCE(_description,'')) > 400 THEN RAISE EXCEPTION 'Descrição muito longa'; END IF;
  IF _image_url IS NOT NULL AND _image_url !~ '^(https://|/__l5e/)' THEN RAISE EXCEPTION 'Imagem inválida'; END IF;
  INSERT INTO catalog_products(product_id, description, image_url, illustrative, published, featured, sort, updated_at)
  VALUES (_product_id, COALESCE(_description,''), _image_url, _illustrative, _published, _featured, COALESCE(_sort,0), now())
  ON CONFLICT (product_id) DO UPDATE SET description=EXCLUDED.description, image_url=EXCLUDED.image_url,
    illustrative=EXCLUDED.illustrative, published=EXCLUDED.published, featured=EXCLUDED.featured, sort=EXCLUDED.sort, updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_catalog_product(text,text,text,boolean,boolean,boolean,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_catalog_product(text,text,text,boolean,boolean,boolean,integer) TO authenticated;