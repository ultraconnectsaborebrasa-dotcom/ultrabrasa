CREATE TABLE public.courier_device_pairs (
 code_hash text PRIMARY KEY CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 courier_id uuid NOT NULL REFERENCES public.delivery_couriers(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes'
);
GRANT ALL ON public.courier_device_pairs TO service_role;
ALTER TABLE public.courier_device_pairs ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.courier_android_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 courier_id uuid NOT NULL REFERENCES public.delivery_couriers(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 secret_hash text NOT NULL UNIQUE CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
 enabled boolean NOT NULL DEFAULT false,
 revoked boolean NOT NULL DEFAULT false,
 fcm_token text,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 last_seen_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.courier_android_devices TO service_role;
ALTER TABLE public.courier_android_devices ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.create_courier_device_pair(p_code_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE own uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Somente o entregador pode vincular seu aparelho'; END IF;
 SELECT id INTO own FROM public.delivery_couriers WHERE user_id=auth.uid() AND active;
 IF own IS NULL OR p_code_hash IS NULL OR p_code_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Vínculo inválido'; END IF;
 DELETE FROM public.courier_device_pairs WHERE user_id=auth.uid();
 INSERT INTO public.courier_device_pairs(code_hash,courier_id,user_id) VALUES(p_code_hash,own,auth.uid());
END $$;
CREATE FUNCTION public.bind_courier_android_device(p_code_hash text,p_secret_hash text,p_fcm_token text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pair public.courier_device_pairs; device_id uuid;
BEGIN
 IF p_secret_hash IS NULL OR p_secret_hash !~ '^[a-f0-9]{64}$' OR length(coalesce(p_fcm_token,''))>4096 THEN RAISE EXCEPTION 'Aparelho inválido'; END IF;
 DELETE FROM public.courier_device_pairs WHERE code_hash=p_code_hash AND expires_at>now() RETURNING * INTO pair;
 IF pair.courier_id IS NULL OR NOT public.has_role(pair.user_id,'courier') OR NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=pair.courier_id AND user_id=pair.user_id AND active) THEN RAISE EXCEPTION 'Código inválido ou expirado'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(pair.courier_id::text,712));
 UPDATE public.courier_android_devices SET revoked=true,enabled=false WHERE courier_id=pair.courier_id AND NOT revoked;
 INSERT INTO public.courier_android_devices(courier_id,user_id,secret_hash,fcm_token) VALUES(pair.courier_id,pair.user_id,p_secret_hash,p_fcm_token) RETURNING id INTO device_id;
 RETURN jsonb_build_object('device_id',device_id,'enabled',false);
END $$;
CREATE FUNCTION public.courier_android_exchange(p_secret_hash text,p_action text,p_latitude double precision DEFAULT NULL,p_longitude double precision DEFAULT NULL,p_accuracy numeric DEFAULT NULL,p_observed_at timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE device public.courier_android_devices; shift_id uuid; tracking boolean;
BEGIN
 SELECT * INTO device FROM public.courier_android_devices WHERE secret_hash=p_secret_hash AND NOT revoked AND expires_at>now() FOR UPDATE;
 IF device.id IS NULL OR NOT public.has_role(device.user_id,'courier') OR NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=device.courier_id AND user_id=device.user_id AND active) THEN RAISE EXCEPTION 'Aparelho sem autorização'; END IF;
 IF p_action NOT IN ('status','resume','pause','location') OR p_action IS NULL THEN RAISE EXCEPTION 'Ação inválida'; END IF;
 IF p_action IN ('resume','pause') THEN
  UPDATE public.courier_android_devices SET enabled=(p_action='resume') WHERE id=device.id RETURNING * INTO device;
  IF p_action='pause' THEN DELETE FROM public.courier_locations WHERE courier_id=device.courier_id; END IF;
 END IF;
 SELECT id INTO shift_id FROM public.courier_time_entries WHERE courier_id=device.courier_id AND exit_at IS NULL FOR UPDATE;
 tracking=device.enabled AND shift_id IS NOT NULL;
 IF p_action='location' AND tracking THEN
  IF p_latitude IS NULL OR NOT (p_latitude BETWEEN -90 AND 90) OR p_longitude IS NULL OR NOT (p_longitude BETWEEN -180 AND 180) OR p_accuracy IS NULL OR NOT (p_accuracy BETWEEN 0 AND 100000) OR p_observed_at IS NULL OR p_observed_at<now()-interval '2 minutes' OR p_observed_at>now()+interval '15 seconds' THEN RAISE EXCEPTION 'Localização inválida ou antiga'; END IF;
  INSERT INTO public.courier_locations(courier_id,user_id,latitude,longitude,accuracy_meters,located_at,updated_at) VALUES(device.courier_id,device.user_id,p_latitude,p_longitude,p_accuracy,p_observed_at,now())
  ON CONFLICT(courier_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy_meters=EXCLUDED.accuracy_meters,located_at=EXCLUDED.located_at,updated_at=now() WHERE public.courier_locations.located_at<EXCLUDED.located_at;
 END IF;
 UPDATE public.courier_android_devices SET last_seen_at=now() WHERE id=device.id;
 RETURN jsonb_build_object('enabled',device.enabled,'shift_open',shift_id IS NOT NULL,'tracking',tracking);
END $$;
CREATE OR REPLACE FUNCTION public.disable_courier_location() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 UPDATE public.courier_android_devices SET enabled=false WHERE user_id=auth.uid();
 DELETE FROM public.courier_locations WHERE user_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.create_courier_device_pair(text),public.bind_courier_android_device(text,text,text),public.courier_android_exchange(text,text,double precision,double precision,numeric,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_courier_device_pair(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bind_courier_android_device(text,text,text),public.courier_android_exchange(text,text,double precision,double precision,numeric,timestamptz) TO service_role;
