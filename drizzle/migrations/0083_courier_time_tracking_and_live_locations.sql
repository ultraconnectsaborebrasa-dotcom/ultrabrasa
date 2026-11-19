CREATE TABLE public.courier_time_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 courier_id uuid NOT NULL REFERENCES public.delivery_couriers(id),
 user_id uuid NOT NULL,
 shift_date date NOT NULL,
 shift_code text NOT NULL CHECK(shift_code IN ('morning','night')),
 scheduled_start time NOT NULL,
 scheduled_end time NOT NULL,
 entry_at timestamptz NOT NULL DEFAULT now(),
 exit_at timestamptz,
 amount numeric(10,2) NOT NULL DEFAULT 60.00 CHECK(amount=60.00),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(courier_id,shift_date,shift_code)
);
GRANT ALL ON public.courier_time_entries TO service_role;
ALTER TABLE public.courier_time_entries ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX courier_one_open_shift_idx ON public.courier_time_entries(courier_id) WHERE exit_at IS NULL;
CREATE INDEX courier_time_entries_day_idx ON public.courier_time_entries(shift_date,courier_id);

CREATE TABLE public.courier_locations(
 courier_id uuid PRIMARY KEY REFERENCES public.delivery_couriers(id),
 user_id uuid NOT NULL,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 accuracy_meters numeric NOT NULL DEFAULT 0 CHECK(accuracy_meters BETWEEN 0 AND 100000),
 located_at timestamptz NOT NULL DEFAULT now(),
 consent_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.courier_locations TO authenticated;
GRANT ALL ON public.courier_locations TO service_role;
ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY courier_locations_admin_read ON public.courier_locations FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE POLICY courier_locations_self_read ON public.courier_locations FOR SELECT TO authenticated USING(user_id=auth.uid() AND public.has_role(auth.uid(),'courier'));

CREATE TABLE public.delivery_operation_settings(
 id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),
 base_address text NOT NULL,
 base_latitude double precision NOT NULL CHECK(base_latitude BETWEEN -90 AND 90),
 base_longitude double precision NOT NULL CHECK(base_longitude BETWEEN -180 AND 180),
 base_place_id text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
GRANT ALL ON public.delivery_operation_settings TO service_role;
ALTER TABLE public.delivery_operation_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.delivery_operation_settings(id,base_address,base_latitude,base_longitude,base_place_id)
VALUES(1,'Gobira Lacerda - Av. Alcides Lacerda, 359 - Rosa Neto, Eunápolis - BA, 45823-025',-16.3501198,-39.5745542,'ChIJZV9OlvZtNgcRL_UeMx2Cdvs');

CREATE FUNCTION public.read_courier_operations(p_from date DEFAULT NULL,p_to date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE is_admin boolean; own uuid; start_day date; end_day date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
 is_admin=public.has_role(auth.uid(),'admin');
 IF NOT is_admin AND NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF NOT is_admin THEN SELECT id INTO own FROM public.delivery_couriers WHERE user_id=auth.uid() AND active; IF own IS NULL THEN RAISE EXCEPTION 'Vincule esta conta a um entregador ativo'; END IF; END IF;
 start_day=coalesce(p_from,(now() AT TIME ZONE 'America/Sao_Paulo')::date);
 end_day=coalesce(p_to,start_day);
 IF end_day<start_day OR end_day-start_day>62 THEN RAISE EXCEPTION 'Selecione um período válido de até 62 dias'; END IF;
 RETURN jsonb_build_object(
  'base',(SELECT to_jsonb(s) FROM public.delivery_operation_settings s WHERE s.id=1),
  'current_courier_id',own,
  'locations',coalesce((SELECT jsonb_agg(jsonb_build_object('courier_id',c.id,'name',c.name,'latitude',l.latitude,'longitude',l.longitude,'accuracy_meters',l.accuracy_meters,'located_at',l.located_at,'consent_at',l.consent_at) ORDER BY c.name) FROM public.courier_locations l JOIN public.delivery_couriers c ON c.id=l.courier_id WHERE c.active AND (is_admin OR c.id=own)),'[]'::jsonb),
  'time_entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'courier_id',t.courier_id,'courier_name',c.name,'shift_date',t.shift_date,'shift_code',t.shift_code,'scheduled_start',t.scheduled_start,'scheduled_end',t.scheduled_end,'entry_at',t.entry_at,'exit_at',t.exit_at,'amount',t.amount) ORDER BY t.entry_at DESC) FROM public.courier_time_entries t JOIN public.delivery_couriers c ON c.id=t.courier_id WHERE (is_admin OR t.courier_id=own) AND (t.shift_date BETWEEN start_day AND end_day OR t.exit_at IS NULL)),'[]'::jsonb)
 );
END $function$;

CREATE FUNCTION public.clock_courier_shift(p_action text,p_shift text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE own uuid; work_day date; created_id uuid; open_id uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Somente o entregador pode registrar o próprio ponto'; END IF;
 SELECT id INTO own FROM public.delivery_couriers WHERE user_id=auth.uid() AND active;
 IF own IS NULL THEN RAISE EXCEPTION 'Vincule esta conta a um entregador ativo'; END IF;
 IF p_shift NOT IN ('morning','night') OR p_action NOT IN ('entry','exit') THEN RAISE EXCEPTION 'Ação de ponto inválida'; END IF;
 PERFORM pg_advisory_xact_lock(742024);
 IF p_action='entry' THEN
  IF EXISTS(SELECT 1 FROM public.courier_time_entries WHERE courier_id=own AND exit_at IS NULL) THEN RAISE EXCEPTION 'Encerre o turno anterior antes de iniciar outro'; END IF;
  work_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
  INSERT INTO public.courier_time_entries(courier_id,user_id,shift_date,shift_code,scheduled_start,scheduled_end)
  VALUES(own,auth.uid(),work_day,p_shift,CASE p_shift WHEN 'morning' THEN '11:00'::time ELSE '18:00'::time END,CASE p_shift WHEN 'morning' THEN '14:00'::time ELSE '22:00'::time END)
  ON CONFLICT(courier_id,shift_date,shift_code) DO NOTHING RETURNING id INTO created_id;
  IF created_id IS NULL THEN RAISE EXCEPTION 'Este turno já foi registrado hoje'; END IF;
 ELSE
  SELECT id INTO open_id FROM public.courier_time_entries WHERE courier_id=own AND shift_code=p_shift AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1 FOR UPDATE;
  IF open_id IS NULL THEN RAISE EXCEPTION 'Nenhuma entrada aberta para este turno'; END IF;
  UPDATE public.courier_time_entries SET exit_at=now(),updated_at=now() WHERE id=open_id;
  DELETE FROM public.courier_locations WHERE courier_id=own;
 END IF;
END $function$;

CREATE FUNCTION public.update_courier_location(p_latitude double precision,p_longitude double precision,p_accuracy numeric DEFAULT 0) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE own uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Somente o entregador pode compartilhar a própria localização'; END IF;
 SELECT id INTO own FROM public.delivery_couriers WHERE user_id=auth.uid() AND active;
 IF own IS NULL OR NOT EXISTS(SELECT 1 FROM public.courier_time_entries WHERE courier_id=own AND exit_at IS NULL) THEN RAISE EXCEPTION 'Registre a entrada do turno antes de compartilhar a localização'; END IF;
 IF p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 OR p_accuracy NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Localização inválida'; END IF;
 INSERT INTO public.courier_locations(courier_id,user_id,latitude,longitude,accuracy_meters,located_at,updated_at)
 VALUES(own,auth.uid(),p_latitude,p_longitude,coalesce(p_accuracy,0),now(),now())
 ON CONFLICT(courier_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy_meters=EXCLUDED.accuracy_meters,located_at=now(),updated_at=now();
END $function$;

CREATE FUNCTION public.disable_courier_location() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 DELETE FROM public.courier_locations WHERE user_id=auth.uid();
END $function$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_locations;

REVOKE ALL ON FUNCTION public.read_courier_operations(date,date),public.clock_courier_shift(text,text),public.update_courier_location(double precision,double precision,numeric),public.disable_courier_location() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_courier_operations(date,date),public.clock_courier_shift(text,text),public.update_courier_location(double precision,double precision,numeric),public.disable_courier_location() TO authenticated;