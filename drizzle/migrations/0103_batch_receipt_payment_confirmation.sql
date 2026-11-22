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
  SELECT data INTO snapshot FROM public.pdv_state WHERE id = 1 FOR UPDATE;
  IF coalesce((snapshot->'cash'->>'open')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CAIXA_FECHADO: abra o caixa antes de confirmar o pagamento';
  END IF;
  IF jsonb_typeof(snapshot->'paymentMethods') = 'array' AND NOT (snapshot->'paymentMethods') ? m THEN
    RAISE EXCEPTION 'Forma de pagamento inválida';
  END IF;

  FOR r IN
    SELECT id
    FROM public.payment_receipts
    WHERE id = ANY(coalesce(_ids, '{}'::uuid[]))
      AND state IN ('unverified', 'review')
      AND (request_id IS NOT NULL OR order_id IS NOT NULL)
    ORDER BY received_at, id
  LOOP
    BEGIN
      result := public.confirm_receipt_payment(r.id, m);
      IF coalesce((result->>'already')::boolean, false) IS NOT TRUE THEN
        confirmed_count := confirmed_count + 1;
        confirmed_amount := confirmed_amount + coalesce((result->>'amount')::numeric, 0);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      skipped := skipped || jsonb_build_array(jsonb_build_object('id', r.id, 'reason', SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'confirmed', confirmed_count,
    'amount', round(confirmed_amount, 2),
    'skipped', skipped
  );
END $$;

REVOKE ALL ON FUNCTION public.confirm_receipt_payments_batch(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_receipt_payments_batch(uuid[], text) TO authenticated, service_role;