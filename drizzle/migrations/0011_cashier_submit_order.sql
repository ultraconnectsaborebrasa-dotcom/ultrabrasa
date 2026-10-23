DO $do$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.submit_pdv_operator(jsonb)'::regprocedure) INTO def;
 def := replace(def, $s$IF NOT (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin')) THEN$s$, $s$IF NOT (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN$s$);
 EXECUTE def;
END $do$;