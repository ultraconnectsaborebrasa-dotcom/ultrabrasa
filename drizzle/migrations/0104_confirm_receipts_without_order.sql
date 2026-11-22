CREATE OR REPLACE FUNCTION public.confirm_receipt_without_order(_id uuid, _method text DEFAULT 'Pix')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.payment_receipts;
  m text := coalesce(nullif(trim(_method), ''), 'Pix');
  actor_name text;
BEGIN
  IF NOT public.wa_staff() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  PERFORM pg_advisory_xact_lock(742019);
  SELECT * INTO r FROM public.payment_receipts WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Comprovante não encontrado';
  END IF;
  IF r.state = 'confirmed' THEN
    RETURN jsonb_build_object('already', true, 'withoutOrder', true);
  END IF;
  IF r.request_id IS NOT NULL OR r.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Comprovante vinculado: use a confirmação com pedido';
  END IF;

  SELECT display_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  UPDATE public.payment_receipts
  SET state = 'confirmed', reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = r.id;
  INSERT INTO public.payment_receipt_events (receipt_id, action, reason, actor, actor_name)
  VALUES (
    r.id,
    'Comprovante Pix conferido sem pedido',
    format('%s · confirmação manual sem lançamento em vendas ou comandas', m),
    auth.uid(),
    coalesce(actor_name, 'Atendente')
  );
  RETURN jsonb_build_object('withoutOrder', true, 'confirmed', true, 'amount', r.amount);
END $$;

REVOKE ALL ON FUNCTION public.confirm_receipt_without_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_receipt_without_order(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_receipt_payments_batch(_ids uuid[], _method text DEFAULT 'Pix')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  result jsonb;
  confirmed_count integer := 0;
  without_order_count integer := 0;
  confirmed_amount numeric := 0;
  skipped jsonb := '[]'::jsonb;
  m text := coalesce(nullif(trim(_method), ''), 'Pix');
  snapshot jsonb;
BEGIN
  IF NOT public.wa_staff() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF coalesce(array_length(_ids, 1), 0) > 100 THEN
    RAISE EXCEPTION 'Selecione no máximo 100 comprovantes por vez';
  END IF;

  PERFORM pg_advisory_xact_lock(742019);
  IF EXISTS (
    SELECT 1 FROM public.payment_receipts
    WHERE id = ANY(coalesce(_ids, '{}'::uuid[]))
      AND state IN ('unverified', 'review')
      AND (request_id IS NOT NULL OR order_id IS NOT NULL)
  ) THEN
    SELECT data INTO snapshot FROM public.pdv_state WHERE id = 1 FOR UPDATE;
    IF coalesce((snapshot->'cash'->>'open')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'CAIXA_FECHADO: abra o caixa antes de confirmar o pagamento';
    END IF;
    IF jsonb_typeof(snapshot->'paymentMethods') = 'array' AND NOT (snapshot->'paymentMethods') ? m THEN
      RAISE EXCEPTION 'Forma de pagamento inválida';
    END IF;
  END IF;

  FOR r IN
    SELECT id, request_id, order_id
    FROM public.payment_receipts
    WHERE id = ANY(coalesce(_ids, '{}'::uuid[]))
      AND state IN ('unverified', 'review')
    ORDER BY received_at, id
  LOOP
    BEGIN
      IF r.request_id IS NOT NULL OR r.order_id IS NOT NULL THEN
        result := public.confirm_receipt_payment(r.id, m);
        IF coalesce((result->>'already')::boolean, false) IS NOT TRUE THEN
          confirmed_amount := confirmed_amount + coalesce((result->>'amount')::numeric, 0);
        END IF;
      ELSE
        result := public.confirm_receipt_without_order(r.id, m);
        IF coalesce((result->>'already')::boolean, false) IS NOT TRUE THEN
          without_order_count := without_order_count + 1;
        END IF;
      END IF;
      IF coalesce((result->>'already')::boolean, false) IS NOT TRUE THEN
        confirmed_count := confirmed_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      skipped := skipped || jsonb_build_array(jsonb_build_object('id', r.id, 'reason', SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'confirmed', confirmed_count,
    'amount', round(confirmed_amount, 2),
    'withoutOrder', without_order_count,
    'skipped', skipped
  );
END $$;

REVOKE ALL ON FUNCTION public.confirm_receipt_payments_batch(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_receipt_payments_batch(uuid[], text) TO authenticated, service_role;