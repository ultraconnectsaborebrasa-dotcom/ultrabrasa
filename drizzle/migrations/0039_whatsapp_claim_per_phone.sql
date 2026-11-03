CREATE OR REPLACE FUNCTION public.wa_claim_job() RETURNS SETOF public.whatsapp_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j public.whatsapp_jobs; BEGIN
IF NOT pg_try_advisory_xact_lock(742028) THEN RETURN; END IF;
UPDATE public.whatsapp_jobs SET state='unknown',processing_error='Processamento interrompido; conferir antes de tentar novamente' WHERE state='running' AND lease_until<now();
SELECT * INTO j FROM public.whatsapp_jobs q WHERE q.state='pending' AND q.next_attempt_at<=now() AND NOT EXISTS(SELECT 1 FROM public.whatsapp_jobs x WHERE x.phone=q.phone AND x.state='running' AND x.lease_until>=now()) ORDER BY q.next_attempt_at,q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 1;
IF j.id IS NOT NULL THEN UPDATE public.whatsapp_jobs SET state='running',lease_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=j.id RETURNING * INTO j; RETURN NEXT j; END IF; END $$;
REVOKE ALL ON FUNCTION public.wa_claim_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wa_claim_job() TO service_role;