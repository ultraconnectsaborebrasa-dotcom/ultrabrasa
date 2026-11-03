CREATE UNIQUE INDEX wa_one_pending_per_conversation ON public.whatsapp_order_requests(phone) WHERE status='awaiting_acceptance';
CREATE OR REPLACE FUNCTION public.wa_confirm_request(_phone text,_inbound_id text,_version integer,_request jsonb,_total numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.whatsapp_conversations; rid uuid; BEGIN
SELECT * INTO c FROM public.whatsapp_conversations WHERE phone=_phone FOR UPDATE;
IF c.phone IS NULL OR c.automation_paused OR c.draft_version<>_version OR coalesce((c.draft->>'summarySent')::boolean,false)=false OR (_total IS DISTINCT FROM (c.draft->>'quotedTotal')::numeric) THEN RETURN NULL; END IF;
SELECT id INTO rid FROM public.whatsapp_order_requests WHERE phone=_phone AND status='awaiting_acceptance'; IF rid IS NOT NULL THEN RETURN rid; END IF;
INSERT INTO public.whatsapp_order_requests(phone,inbound_id,request,quoted_total) VALUES(_phone,_inbound_id,_request,_total) ON CONFLICT(inbound_id) DO UPDATE SET inbound_id=EXCLUDED.inbound_id RETURNING id INTO rid;
UPDATE public.whatsapp_conversations SET automation_paused=true,attendance_status='needs_reply',draft_version=draft_version+1 WHERE phone=_phone;
RETURN rid; END $$;
REVOKE ALL ON FUNCTION public.wa_confirm_request(text,text,integer,jsonb,numeric) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.wa_confirm_request(text,text,integer,jsonb,numeric) TO service_role;
CREATE OR REPLACE FUNCTION public.wa_claim_job() RETURNS SETOF public.whatsapp_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j public.whatsapp_jobs; BEGIN
IF NOT pg_try_advisory_xact_lock(742028) THEN RETURN; END IF;
UPDATE public.whatsapp_jobs SET state='unknown',processing_error='Processamento interrompido; conferir antes de tentar novamente' WHERE state='running' AND lease_until<now();
IF EXISTS(SELECT 1 FROM public.whatsapp_jobs WHERE state='running' AND lease_until>=now()) THEN RETURN; END IF;
SELECT * INTO j FROM public.whatsapp_jobs WHERE state='pending' AND next_attempt_at<=now() ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
IF j.id IS NOT NULL THEN UPDATE public.whatsapp_jobs SET state='running',lease_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=j.id RETURNING * INTO j; RETURN NEXT j; END IF; END $$;
CREATE OR REPLACE FUNCTION public.wa_reject_request(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF; UPDATE public.whatsapp_order_requests SET status='rejected',updated_at=now() WHERE id=_id AND status='awaiting_acceptance'; UPDATE public.whatsapp_conversations SET draft='{}',draft_version=draft_version+1 WHERE phone=(SELECT phone FROM public.whatsapp_order_requests WHERE id=_id); END $$;