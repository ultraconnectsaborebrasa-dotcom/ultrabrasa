CREATE OR REPLACE FUNCTION public.save_pdv_state(payload jsonb, expected_revision integer) RETURNS public.pdv_state LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public.pdv_state; result public.pdv_state; actor_name text;
BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administrador acessa valores e altera o PDV'; END IF;
PERFORM pg_advisory_xact_lock(742019);
SELECT * INTO current_row FROM public.pdv_state WHERE id=1 FOR UPDATE;
IF coalesce(current_row.revision,0)<>expected_revision THEN RAISE EXCEPTION 'Dados atualizados em outro terminal. Aguarde a sincronização e tente novamente.'; END IF;
IF jsonb_typeof(payload->'orders') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'products') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'settings') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'cash') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Dados inválidos'; END IF;
SELECT jsonb_set(payload,'{products}',coalesce(jsonb_agg(p.value) FILTER (WHERE jsonb_typeof(p.value)='object' AND nullif(p.value->>'id','') IS NOT NULL AND nullif(p.value->>'name','') IS NOT NULL),'[]'::jsonb)) INTO payload FROM jsonb_array_elements(payload->'products') AS p(value);
IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'orders') o WHERE o->>'type'='Mesa' AND o->>'status'='cozinha' AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(current_row.data->'orders','[]')) prev WHERE prev->>'id'=o->>'id') OR o->'tableNumber' IS NOT NULL AND o->'tableNumber'<>'null'::jsonb) AND (o->>'tableNumber' IS NULL OR (o->>'tableNumber')::integer NOT BETWEEN 1 AND 5)) THEN RAISE EXCEPTION 'Escolha uma das cinco mesas'; END IF;
SELECT display_name INTO actor_name FROM public.profiles WHERE id=auth.uid();
SELECT jsonb_set(payload,'{orders}',coalesce(jsonb_agg(CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(current_row.data->'orders','[]')) prev WHERE prev->>'id'=o->>'id') THEN o||jsonb_build_object('sellerId',auth.uid(),'sellerName',actor_name) ELSE o END),'[]'::jsonb)) INTO payload FROM jsonb_array_elements(payload->'orders') o;
INSERT INTO public.pdv_state(id,data,revision) VALUES(1,payload,1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,revision=pdv_state.revision+1,updated_at=now() RETURNING * INTO result;
RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_pdv_state(jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_pdv_state(jsonb,integer) TO authenticated;

WITH cleaned AS (
 SELECT s.id,
 jsonb_set(s.data,'{products}',(SELECT coalesce(jsonb_agg(p.value) FILTER (WHERE jsonb_typeof(p.value)='object' AND nullif(p.value->>'id','') IS NOT NULL AND nullif(p.value->>'name','') IS NOT NULL),'[]'::jsonb) FROM jsonb_array_elements(s.data->'products') AS p(value))) AS data,
 EXISTS(SELECT 1 FROM jsonb_array_elements(s.data->'products') AS q(value) WHERE jsonb_typeof(q.value) IS DISTINCT FROM 'object' OR nullif(q.value->>'id','') IS NULL OR nullif(q.value->>'name','') IS NULL) AS needs_repair
 FROM public.pdv_state s WHERE s.id=1
)
UPDATE public.pdv_state s SET data=cleaned.data,revision=s.revision+1,updated_at=now()
FROM cleaned WHERE s.id=cleaned.id AND cleaned.needs_repair;