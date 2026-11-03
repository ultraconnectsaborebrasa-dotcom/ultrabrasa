CREATE POLICY "catalog photos admin insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='catalog-photos' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "catalog photos admin read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='catalog-photos' AND public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.save_catalog_product(_product_id text, _description text, _image_url text, _illustrative boolean, _published boolean, _featured boolean, _sort integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administrador'; END IF;
  IF length(COALESCE(_description,'')) > 400 THEN RAISE EXCEPTION 'Descrição muito longa'; END IF;
  IF _image_url IS NOT NULL AND _image_url !~ '^(https://|/__l5e/|/api/public/catalog-photo/[A-Za-z0-9._-]+$)' THEN RAISE EXCEPTION 'Imagem inválida'; END IF;
  INSERT INTO catalog_products(product_id, description, image_url, illustrative, published, featured, sort, updated_at)
  VALUES (_product_id, COALESCE(_description,''), _image_url, _illustrative, _published, _featured, COALESCE(_sort,0), now())
  ON CONFLICT (product_id) DO UPDATE SET description=EXCLUDED.description, image_url=EXCLUDED.image_url,
    illustrative=EXCLUDED.illustrative, published=EXCLUDED.published, featured=EXCLUDED.featured, sort=EXCLUDED.sort, updated_at=now();
END $function$;