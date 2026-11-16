DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.read_public_catalog()'::regprocedure);
 IF position('AND (p.product->''stock'' IS NULL OR (p.product->>''stock'')::numeric>0)' IN d)=0 THEN RAISE EXCEPTION 'Daily offer stock insertion point missing'; END IF;
 d:=replace(d,'AND (p.product->''stock'' IS NULL OR (p.product->>''stock'')::numeric>0)','AND (p.product->>''stock'' IS NULL OR (p.product->>''stock'')::numeric>0)');
 EXECUTE d;
END $$;