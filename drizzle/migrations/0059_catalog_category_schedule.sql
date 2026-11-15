DO $$ DECLARE d text; target text := '  total=total+(p->>''price'')::numeric*qty;'; replacement text := '  IF lower(btrim(p->>''category''))=''marmitas'' AND (now() AT TIME ZONE ''America/Bahia'')::time >= time ''14:00'' THEN RAISE EXCEPTION ''Marmitas indisponíveis após 14:00''; END IF;
  IF lower(btrim(p->>''category'')) IN (''hambúrgueres'',''acompanhamentos'') AND (now() AT TIME ZONE ''America/Bahia'')::time < time ''17:00'' THEN RAISE EXCEPTION ''Hambúrgueres e acompanhamentos disponíveis a partir das 17:00; preparo a partir das 18:00''; END IF;
  total=total+(p->>''price'')::numeric*qty;'; BEGIN
 d:=pg_get_functiondef('public.catalog_place_order(uuid,jsonb)'::regprocedure);
 IF position(target IN d)=0 THEN RAISE EXCEPTION 'Catalog validation insertion point missing'; END IF;
 EXECUTE replace(d,target,replacement);
END $$;