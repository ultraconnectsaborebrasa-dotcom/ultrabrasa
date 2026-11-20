CREATE OR REPLACE FUNCTION public.reset_pdv_operation_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  previous_orders integer;
  previous_deliveries integer;
  previous_receipts integer;
BEGIN
  SELECT jsonb_array_length(COALESCE(data->'orders','[]'::jsonb)) INTO previous_orders FROM public.pdv_state WHERE id=1;
  SELECT count(*) INTO previous_deliveries FROM public.delivery_orders;
  SELECT count(*) INTO previous_receipts FROM public.payment_receipts;

  ALTER TABLE public.pdv_state DISABLE TRIGGER pdv_terminal_guard;

  DELETE FROM public.payment_receipt_events WHERE id IS NOT NULL;
  DELETE FROM public.payment_receipts WHERE id IS NOT NULL;
  DELETE FROM public.whatsapp_order_requests WHERE id IS NOT NULL;
  DELETE FROM public.pdv_customer_visits WHERE order_id IS NOT NULL;
  DELETE FROM public.delivery_operational_events WHERE id IS NOT NULL;
  DELETE FROM public.external_delivery_events WHERE event_id IS NOT NULL;
  DELETE FROM public.external_delivery_outbox WHERE order_id IS NOT NULL;
  DELETE FROM public.delivery_orders WHERE id IS NOT NULL;
  DELETE FROM public.delivery_routes WHERE id IS NOT NULL;

  UPDATE public.whatsapp_messages SET order_id=NULL WHERE order_id IS NOT NULL;
  UPDATE public.whatsapp_conversations SET order_confirmed_at=NULL WHERE order_confirmed_at IS NOT NULL;
  UPDATE public.whatsapp_jobs
    SET state='cancelled',lease_until=NULL,processing_error='Pedido removido na limpeza para nova operação'
    WHERE state IN ('pending','running')
      AND (payload ? 'orderId' OR payload ? 'requestId');

  UPDATE public.pdv_state
    SET data=jsonb_set(jsonb_set(data,'{orders}','[]'::jsonb,false),'{nextNumber}','1'::jsonb,false),
        revision=revision+1,
        updated_at=now()
    WHERE id=1;

  ALTER TABLE public.pdv_state ENABLE TRIGGER pdv_terminal_guard;

  RETURN jsonb_build_object('pedidos_removidos',previous_orders,'entregas_removidas',previous_deliveries,'comprovantes_removidos',previous_receipts);
EXCEPTION WHEN OTHERS THEN
  ALTER TABLE public.pdv_state ENABLE TRIGGER pdv_terminal_guard;
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_pdv_operation_maintenance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_pdv_operation_maintenance() TO service_role;
COMMENT ON FUNCTION public.reset_pdv_operation_maintenance() IS 'Manutenção destrutiva restrita: limpa pedidos, vendas e entregas e reinicia a numeração. Sem acesso para usuários do aplicativo.';