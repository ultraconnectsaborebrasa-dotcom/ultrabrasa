CREATE OR REPLACE FUNCTION public.record_payment_receipt_input(_input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Sem permissão'; END IF;
RETURN public.record_payment_receipt((_input->>'message')::uuid,nullif(_input->>'path',''),nullif(_input->>'hash',''),_input->'evidence',nullif(_input->>'request','')::uuid,coalesce((_input->>'compatible')::boolean,false),coalesce(_input->>'reason','Conferência necessária'));
END $$;
REVOKE ALL ON FUNCTION public.record_payment_receipt_input(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_receipt_input(jsonb) TO service_role;