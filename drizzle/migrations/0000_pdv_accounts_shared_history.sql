CREATE TYPE public.app_role AS ENUM ('admin','operator');
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, display_name text NOT NULL DEFAULT 'Atendente');
GRANT SELECT, UPDATE ON public.profiles TO authenticated; GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role public.app_role NOT NULL, UNIQUE(user_id,role));
GRANT SELECT ON public.user_roles TO authenticated; GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO authenticated;
CREATE POLICY roles_read ON public.user_roles FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (id=auth.uid()) WITH CHECK(id=auth.uid());
CREATE FUNCTION public.pdv_profile_created() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO public.profiles(id,display_name) VALUES(NEW.id,coalesce(nullif(NEW.raw_user_meta_data->>'display_name',''),nullif(NEW.raw_user_meta_data->>'full_name',''),'Atendente')); RETURN NEW; END $$;
CREATE TRIGGER pdv_profile_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.pdv_profile_created();
CREATE FUNCTION public.claim_pdv_admin() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND lower(email)='ultraconnectsaborebrasa@gmail.com' AND email_confirmed_at IS NOT NULL) THEN RETURN false; END IF; INSERT INTO public.user_roles(user_id,role) VALUES(auth.uid(),'admin') ON CONFLICT DO NOTHING; RETURN true; END $$;
REVOKE ALL ON FUNCTION public.claim_pdv_admin() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.claim_pdv_admin() TO authenticated;
CREATE TABLE public.pdv_state (id integer PRIMARY KEY DEFAULT 1 CHECK(id=1), data jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.pdv_state TO authenticated; GRANT ALL ON public.pdv_state TO service_role;
ALTER TABLE public.pdv_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY state_read ON public.pdv_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE FUNCTION public.set_pdv_role(target uuid, new_role public.app_role) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF; IF target=auth.uid() THEN RAISE EXCEPTION 'Não altere seu próprio acesso'; END IF; DELETE FROM public.user_roles WHERE user_id=target; IF new_role IS NOT NULL THEN INSERT INTO public.user_roles(user_id,role) VALUES(target,new_role); END IF; END $$;
REVOKE ALL ON FUNCTION public.set_pdv_role(uuid,public.app_role) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.set_pdv_role(uuid,public.app_role) TO authenticated;
CREATE FUNCTION public.save_pdv_state(payload jsonb, expected_revision integer) RETURNS public.pdv_state LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public.pdv_state; result public.pdv_state; old_order jsonb; new_order jsonb; old_product jsonb; actor_name text;
BEGIN
IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
PERFORM pg_advisory_xact_lock(742019);
SELECT * INTO current_row FROM public.pdv_state WHERE id=1 FOR UPDATE;
IF coalesce(current_row.revision,0)<>expected_revision THEN RAISE EXCEPTION 'Dados atualizados em outro terminal. Recarregue antes de continuar.'; END IF;
IF jsonb_typeof(payload->'orders')<>'array' OR jsonb_typeof(payload->'products')<>'array' OR jsonb_typeof(payload->'settings')<>'object' OR jsonb_typeof(payload->'cash')<>'object' THEN RAISE EXCEPTION 'Dados inválidos'; END IF;
IF NOT public.has_role(auth.uid(),'admin') THEN
IF current_row.id IS NULL OR payload->'settings' IS DISTINCT FROM current_row.data->'settings' THEN RAISE EXCEPTION 'Somente administrador altera ajustes'; END IF;
IF jsonb_array_length(payload->'products')<>jsonb_array_length(current_row.data->'products') THEN RAISE EXCEPTION 'Somente administrador altera produtos'; END IF;
FOR old_product IN SELECT value FROM jsonb_array_elements(current_row.data->'products') LOOP
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'products') p WHERE p->>'id'=old_product->>'id' AND p-'stock'=old_product-'stock') THEN RAISE EXCEPTION 'Somente administrador altera produtos'; END IF; END LOOP;
FOR old_order IN SELECT value FROM jsonb_array_elements(current_row.data->'orders') LOOP
SELECT value INTO new_order FROM jsonb_array_elements(payload->'orders') WHERE value->>'id'=old_order->>'id';
IF new_order IS NULL OR (old_order->>'status' IN ('pago','cancelado') AND old_order IS DISTINCT FROM new_order) OR new_order->>'status'='cancelado' THEN RAISE EXCEPTION 'Somente administrador cancela ou altera vendas finalizadas'; END IF; END LOOP;
END IF;
SELECT display_name INTO actor_name FROM public.profiles WHERE id=auth.uid();
SELECT jsonb_set(payload,'{orders}',coalesce(jsonb_agg(CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(current_row.data->'orders','[]')) prev WHERE prev->>'id'=o->>'id') THEN o || jsonb_build_object('sellerId',auth.uid(),'sellerName',actor_name) ELSE o END),'[]')) INTO payload FROM jsonb_array_elements(payload->'orders') o;
INSERT INTO public.pdv_state(id,data,revision) VALUES(1,payload,1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,revision=pdv_state.revision+1,updated_at=now() RETURNING * INTO result;
RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_pdv_state(jsonb,integer) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.save_pdv_state(jsonb,integer) TO authenticated;