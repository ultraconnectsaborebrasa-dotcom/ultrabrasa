CREATE OR REPLACE FUNCTION public.wa_auto_accept_request(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE admin_id uuid;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY id LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'Nenhum administrador cadastrado'; END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',admin_id::text,'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  RETURN public.wa_accept_request(_id);
END $$;
REVOKE ALL ON FUNCTION public.wa_auto_accept_request(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_auto_accept_request(uuid) TO service_role;