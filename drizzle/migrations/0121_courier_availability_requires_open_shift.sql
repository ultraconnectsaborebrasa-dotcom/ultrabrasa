CREATE FUNCTION public.courier_has_open_shift(p_courier_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.courier_time_entries WHERE courier_id=p_courier_id AND exit_at IS NULL); $$;
REVOKE ALL ON FUNCTION public.courier_has_open_shift(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.courier_has_open_shift(uuid) TO service_role;

CREATE FUNCTION public.guard_courier_shift_availability() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.operational_status='available' AND (NOT NEW.active OR NEW.deleted_at IS NOT NULL OR NOT public.courier_has_open_shift(NEW.id)) THEN NEW.operational_status='unavailable'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_courier_shift_availability() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_courier_shift_availability BEFORE INSERT OR UPDATE ON public.delivery_couriers FOR EACH ROW EXECUTE FUNCTION public.guard_courier_shift_availability();

CREATE FUNCTION public.sync_courier_shift_availability() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid;
BEGIN
 target=CASE WHEN TG_OP='DELETE' THEN OLD.courier_id ELSE NEW.courier_id END;
 IF TG_OP<>'DELETE' AND NEW.exit_at IS NULL THEN
  UPDATE public.delivery_couriers SET operational_status='available',status_updated_at=now() WHERE id=target AND active AND deleted_at IS NULL;
 ELSIF NOT public.courier_has_open_shift(target) THEN
  UPDATE public.delivery_couriers SET operational_status='unavailable',status_updated_at=now() WHERE id=target;
  DELETE FROM public.courier_locations WHERE courier_id=target;
 END IF;
 RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.sync_courier_shift_availability() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_courier_shift_availability AFTER INSERT OR UPDATE OF exit_at OR DELETE ON public.courier_time_entries FOR EACH ROW EXECUTE FUNCTION public.sync_courier_shift_availability();

DO $migration$
DECLARE definition text; updated text;
BEGIN
 SELECT pg_get_functiondef('public.assert_courier_marmita_stock(uuid,uuid[],uuid)'::regprocedure) INTO definition;
 updated=replace(definition,'IF courier_status IS NULL THEN','IF NOT public.courier_has_open_shift(p_courier_id) THEN RAISE EXCEPTION ''O entregador precisa bater o ponto de entrada antes de receber entregas''; END IF; IF courier_status IS NULL THEN');
 IF updated=definition THEN RAISE EXCEPTION 'Assignment guard patch does not match'; END IF;
 EXECUTE updated;
 SELECT pg_get_functiondef('public.read_delivery_board()'::regprocedure) INTO definition;
 updated=replace(definition,'''initial_quantity'',s.initial_quantity', '''open_shift'',public.courier_has_open_shift(c.id),''operational_status'',CASE WHEN public.courier_has_open_shift(c.id) THEN c.operational_status ELSE ''unavailable'' END,''initial_quantity'',s.initial_quantity');
 IF updated=definition THEN RAISE EXCEPTION 'Board projection patch does not match'; END IF;
 EXECUTE updated;
 SELECT pg_get_functiondef('public.read_courier_operations(date,date)'::regprocedure) INTO definition;
 updated=replace(definition,'WHERE c.active AND (can_manage OR c.id=own)','WHERE c.active AND c.deleted_at IS NULL AND c.operational_status=''available'' AND public.courier_has_open_shift(c.id) AND (can_manage OR c.id=own)');
 IF updated=definition THEN RAISE EXCEPTION 'Location projection patch does not match'; END IF;
 EXECUTE updated;
END $migration$;