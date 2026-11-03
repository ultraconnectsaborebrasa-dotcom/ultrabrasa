CREATE OR REPLACE FUNCTION public.wa_store_inbound(_message jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE mid uuid; BEGIN
INSERT INTO public.whatsapp_messages(wa_message_id,phone,direction,source,kind,body,media_id,status,provider_at) VALUES(_message->>'id',_message->>'phone','in','customer',_message->>'kind',_message->>'body',nullif(_message->>'media',''),'received',(_message->>'at')::timestamptz) ON CONFLICT(wa_message_id) DO NOTHING RETURNING id INTO mid;
IF mid IS NULL THEN RETURN false; END IF;
PERFORM public.wa_touch_inbound(_message->>'phone',_message->>'body',nullif(_message->>'name',''),(_message->>'at')::timestamptz); RETURN true; END $$;
REVOKE ALL ON FUNCTION public.wa_store_inbound(jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.wa_store_inbound(jsonb) TO service_role;
CREATE INDEX wa_pending_confirmed ON public.whatsapp_order_requests(created_at) WHERE status='awaiting_acceptance';