ALTER TABLE public.delivery_couriers
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid;

COMMENT ON COLUMN public.delivery_couriers.deleted_at IS 'Exclusão lógica: oculta o cadastro da operação e preserva todo o histórico.';
COMMENT ON COLUMN public.delivery_couriers.deleted_by IS 'Conta que realizou a exclusão lógica do entregador.';

CREATE OR REPLACE FUNCTION public.set_delivery_courier_state(p_courier_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target public.delivery_couriers;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN
    RAISE EXCEPTION 'Somente o administrador ou o caixa pode gerenciar entregadores';
  END IF;
  IF p_action NOT IN ('deactivate','activate','delete') THEN
    RAISE EXCEPTION 'Ação inválida';
  END IF;

  PERFORM pg_advisory_xact_lock(742021);
  SELECT * INTO target FROM public.delivery_couriers WHERE id=p_courier_id FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Entregador não encontrado'; END IF;

  IF p_action='activate' THEN
    IF target.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Um entregador excluído não pode ser reativado'; END IF;
    UPDATE public.delivery_couriers
    SET active=true,operational_status='available',status_updated_at=now()
    WHERE id=p_courier_id;
    RETURN;
  END IF;

  IF target.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Este entregador já foi excluído'; END IF;

  IF EXISTS(
    SELECT 1
    FROM public.delivery_orders d
    LEFT JOIN public.delivery_routes r ON r.id=d.route_id
    WHERE d.status NOT IN ('Entregue','Cancelado')
      AND coalesce(r.courier_id,d.assigned_courier_id)=p_courier_id
  ) THEN
    RAISE EXCEPTION 'Conclua ou transfira as entregas em andamento antes de desativar ou excluir este entregador';
  END IF;

  IF EXISTS(SELECT 1 FROM public.courier_time_entries WHERE courier_id=p_courier_id AND exit_at IS NULL) THEN
    RAISE EXCEPTION 'Registre a saída do turno aberto antes de desativar ou excluir este entregador';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.courier_marmita_stock
    WHERE courier_id=p_courier_id AND remaining_quantity>0 AND coalesce(journey_status,'on_route')<>'returned'
  ) THEN
    RAISE EXCEPTION 'Registre o retorno da carga antes de desativar ou excluir este entregador';
  END IF;

  IF p_action='deactivate' THEN
    UPDATE public.delivery_couriers
    SET active=false,operational_status='unavailable',status_updated_at=now()
    WHERE id=p_courier_id;
  ELSE
    UPDATE public.delivery_couriers
    SET active=false,operational_status='unavailable',status_updated_at=now(),deleted_at=now(),deleted_by=auth.uid()
    WHERE id=p_courier_id;
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.set_delivery_courier_state(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_delivery_courier_state(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.save_delivery_courier(courier_id uuid DEFAULT NULL::uuid, courier_name text DEFAULT ''::text, courier_phone text DEFAULT ''::text, account_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE cid uuid;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF trim(courier_name)='' OR length(courier_name)>120 THEN RAISE EXCEPTION 'Informe o nome'; END IF;
 IF account_id IS NOT NULL AND NOT public.has_role(account_id,'courier') THEN RAISE EXCEPTION 'Libere esta conta como Entregador na equipe'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 IF courier_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=courier_id AND deleted_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Um entregador excluído não pode ser editado';
 END IF;
 cid=coalesce(courier_id,gen_random_uuid());
 INSERT INTO public.delivery_couriers(id,name,phone,user_id) VALUES(cid,trim(courier_name),left(courier_phone,25),account_id) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,user_id=EXCLUDED.user_id;
 RETURN cid;
END $function$;

REVOKE ALL ON FUNCTION public.save_delivery_courier(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_delivery_courier(uuid,text,text,uuid) TO authenticated,service_role;