ALTER TABLE public.courier_time_entries ADD COLUMN IF NOT EXISTS paid_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0);
ALTER TABLE public.courier_time_entries ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.courier_time_entries ADD COLUMN IF NOT EXISTS paid_by uuid;
ALTER TABLE public.courier_time_entries ADD COLUMN IF NOT EXISTS paid_by_name text;

CREATE OR REPLACE FUNCTION public.set_courier_shift_payment(p_entry_id uuid, p_paid_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.courier_time_entries; who text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente o administrador pode registrar pagamento de turno'; END IF;
 SELECT * INTO t FROM public.courier_time_entries WHERE id=p_entry_id FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Turno não encontrado'; END IF;
 IF t.exit_at IS NULL THEN RAISE EXCEPTION 'Registre a saída do turno antes de pagar'; END IF;
 IF p_paid_amount IS NULL OR p_paid_amount<0 OR p_paid_amount>t.amount THEN RAISE EXCEPTION 'Valor pago deve ficar entre R$ 0,00 e o valor do turno'; END IF;
 SELECT display_name INTO who FROM public.profiles WHERE id=auth.uid();
 UPDATE public.courier_time_entries SET paid_amount=round(p_paid_amount,2),
  paid_at=CASE WHEN p_paid_amount>0 THEN now() END, paid_by=CASE WHEN p_paid_amount>0 THEN auth.uid() END,
  paid_by_name=CASE WHEN p_paid_amount>0 THEN who END, updated_at=now() WHERE id=p_entry_id;
END $$;
REVOKE ALL ON FUNCTION public.set_courier_shift_payment(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_courier_shift_payment(uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.read_courier_operations(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE can_manage boolean; own uuid; start_day date; end_day date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
 can_manage=public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier');
 IF NOT can_manage AND NOT public.has_role(auth.uid(),'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF NOT can_manage THEN SELECT id INTO own FROM public.delivery_couriers WHERE user_id=auth.uid() AND active; IF own IS NULL THEN RAISE EXCEPTION 'Vincule esta conta a um entregador ativo'; END IF; END IF;
 start_day=coalesce(p_from,(now() AT TIME ZONE 'America/Sao_Paulo')::date);
 end_day=coalesce(p_to,start_day);
 IF end_day<start_day OR end_day-start_day>62 THEN RAISE EXCEPTION 'Selecione um período válido de até 62 dias'; END IF;
 RETURN jsonb_build_object(
  'base',(SELECT to_jsonb(s) FROM public.delivery_operation_settings s WHERE s.id=1),
  'current_courier_id',own,
  'locations',coalesce((SELECT jsonb_agg(jsonb_build_object('courier_id',c.id,'name',c.name,'latitude',l.latitude,'longitude',l.longitude,'accuracy_meters',l.accuracy_meters,'located_at',l.located_at,'consent_at',l.consent_at) ORDER BY c.name) FROM public.courier_locations l JOIN public.delivery_couriers c ON c.id=l.courier_id WHERE c.active AND c.deleted_at IS NULL AND c.operational_status='available' AND public.courier_has_open_shift(c.id) AND (can_manage OR c.id=own)),'[]'::jsonb),
  'time_entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'courier_id',t.courier_id,'courier_name',c.name,'shift_date',t.shift_date,'shift_code',t.shift_code,'scheduled_start',t.scheduled_start,'scheduled_end',t.scheduled_end,'entry_at',t.entry_at,'exit_at',t.exit_at,'amount',t.amount,'paid_amount',t.paid_amount,'paid_at',t.paid_at,'paid_by_name',t.paid_by_name) ORDER BY t.entry_at DESC) FROM public.courier_time_entries t JOIN public.delivery_couriers c ON c.id=t.courier_id WHERE (can_manage OR t.courier_id=own) AND (t.shift_date BETWEEN start_day AND end_day OR t.exit_at IS NULL)),'[]'::jsonb)
 );
END $function$;