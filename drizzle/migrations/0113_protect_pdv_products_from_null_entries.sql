CREATE OR REPLACE FUNCTION public.sanitize_pdv_state_products()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
BEGIN
 IF jsonb_typeof(NEW.data->'products')='array' THEN
  SELECT jsonb_set(NEW.data,'{products}',coalesce(jsonb_agg(p.value) FILTER (WHERE jsonb_typeof(p.value)='object' AND nullif(p.value->>'id','') IS NOT NULL AND nullif(p.value->>'name','') IS NOT NULL),'[]'::jsonb))
  INTO NEW.data FROM jsonb_array_elements(NEW.data->'products') AS p(value);
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.sanitize_pdv_state_products() FROM PUBLIC,anon;
DROP TRIGGER IF EXISTS sanitize_pdv_state_products ON public.pdv_state;
CREATE TRIGGER sanitize_pdv_state_products BEFORE INSERT OR UPDATE OF data ON public.pdv_state FOR EACH ROW EXECUTE FUNCTION public.sanitize_pdv_state_products();

WITH cleaned AS (
 SELECT s.id,
 jsonb_set(s.data,'{products}',(SELECT coalesce(jsonb_agg(p.value) FILTER (WHERE jsonb_typeof(p.value)='object' AND nullif(p.value->>'id','') IS NOT NULL AND nullif(p.value->>'name','') IS NOT NULL),'[]'::jsonb) FROM jsonb_array_elements(s.data->'products') AS p(value))) AS data,
 EXISTS(SELECT 1 FROM jsonb_array_elements(s.data->'products') AS q(value) WHERE jsonb_typeof(q.value) IS DISTINCT FROM 'object' OR nullif(q.value->>'id','') IS NULL OR nullif(q.value->>'name','') IS NULL) AS needs_repair
 FROM public.pdv_state s WHERE s.id=1
)
UPDATE public.pdv_state s SET data=cleaned.data,revision=s.revision+1,updated_at=now()
FROM cleaned WHERE s.id=cleaned.id AND cleaned.needs_repair;