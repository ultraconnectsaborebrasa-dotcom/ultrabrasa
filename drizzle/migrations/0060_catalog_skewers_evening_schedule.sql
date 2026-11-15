DO $$ DECLARE d text; target text := 'IN (''hambúrgueres'',''acompanhamentos'')'; BEGIN
 d:=pg_get_functiondef('public.catalog_place_order(uuid,jsonb)'::regprocedure);
 IF position(target IN d)=0 THEN RAISE EXCEPTION 'Evening category validation not found'; END IF;
 d:=replace(d,target,'IN (''hambúrgueres'',''espetinhos'',''acompanhamentos'')');
 d:=replace(d,'Hambúrgueres e acompanhamentos disponíveis a partir das 17:00','Hambúrgueres, espetinhos e acompanhamentos disponíveis a partir das 17:00');
 EXECUTE d;
END $$;