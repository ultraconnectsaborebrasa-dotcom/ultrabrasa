CREATE OR REPLACE FUNCTION public.normalize_phone(_raw text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$ DECLARE d text; BEGIN
 IF _raw IS NULL OR _raw ~ '@g\.us|@broadcast|-' THEN RETURN NULL; END IF;
 d=regexp_replace(_raw,'\D','','g');
 IF length(d) IN (10,11) THEN d='55'||d; END IF;
 IF d ~ '^55[1-9][0-9][6-9][0-9]{7}$' THEN d=substr(d,1,4)||'9'||substr(d,5); END IF;
 IF d !~ '^[1-9][0-9]{9,14}$' THEN RETURN NULL; END IF;
 RETURN d; END $$;
CREATE OR REPLACE FUNCTION public.valid_person_name(_n text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT length(btrim(coalesce(_n,''))) BETWEEN 2 AND 80 AND length(regexp_replace(coalesce(_n,''),'[^[:alpha:]]','','g'))>=2 AND coalesce(_n,'') !~ '^[^[:alpha:]]*$' $$;

ALTER TABLE public.pdv_customers
 ADD COLUMN name_status text NOT NULL DEFAULT 'confirmed' CHECK (name_status IN ('missing','provisional','confirmed')),
 ADD COLUMN profile_name text,
 ADD COLUMN contact_sync_status text NOT NULL DEFAULT 'awaiting_name' CHECK (contact_sync_status IN ('awaiting_name','not_synced','pending','saved','failed','review')),
 ADD COLUMN contact_external_id text,
 ADD COLUMN contact_sync_error text,
 ADD COLUMN contact_sync_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN updated_by uuid,
 ADD COLUMN updated_by_name text;
UPDATE public.pdv_customers SET name_status=CASE WHEN public.valid_person_name(name) THEN 'confirmed' ELSE 'missing' END,
 contact_sync_status=CASE WHEN public.valid_person_name(name) THEN 'not_synced' ELSE 'awaiting_name' END;

CREATE TABLE public.customer_identity_changes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.pdv_customers(id) ON DELETE CASCADE, field text NOT NULL, old_value text, new_value text, changed_by uuid, changed_by_name text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.customer_identity_changes TO authenticated; GRANT ALL ON public.customer_identity_changes TO service_role;
ALTER TABLE public.customer_identity_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_changes_admin_read ON public.customer_identity_changes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- name quality guard for every write path
CREATE OR REPLACE FUNCTION public.customer_name_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NOT public.valid_person_name(NEW.name) THEN NEW.name_status=CASE WHEN NEW.name_status='provisional' AND public.valid_person_name(NEW.name) THEN 'provisional' ELSE 'missing' END; END IF;
 IF TG_OP='UPDATE' AND OLD.name_status='confirmed' AND NEW.name_status<>'confirmed' AND public.valid_person_name(OLD.name) THEN NEW.name=OLD.name; NEW.name_status='confirmed'; END IF;
 IF NEW.name_status='confirmed' AND NEW.contact_sync_status='awaiting_name' THEN NEW.contact_sync_status='pending'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER customer_name_guard BEFORE INSERT OR UPDATE ON public.pdv_customers FOR EACH ROW EXECUTE FUNCTION public.customer_name_guard();

-- link every WhatsApp conversation to one customer by normalized phone
CREATE OR REPLACE FUNCTION public.wa_link_customer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE np text; cid uuid; ok boolean; BEGIN
 np=public.normalize_phone(NEW.phone); IF np IS NULL THEN RETURN NEW; END IF;
 ok=public.valid_person_name(NEW.name);
 SELECT id INTO cid FROM public.pdv_customers WHERE phone=np;
 IF cid IS NULL THEN
  INSERT INTO public.pdv_customers(name,phone,name_status,profile_name,contact_sync_status) VALUES(CASE WHEN ok THEN btrim(NEW.name) ELSE '' END,np,CASE WHEN ok THEN 'provisional' ELSE 'missing' END,NEW.name,'awaiting_name')
  ON CONFLICT(phone) DO NOTHING RETURNING id INTO cid;
  IF cid IS NULL THEN SELECT id INTO cid FROM public.pdv_customers WHERE phone=np; END IF;
 ELSE
  UPDATE public.pdv_customers SET profile_name=coalesce(NEW.name,profile_name),
   name=CASE WHEN name_status='missing' AND ok THEN btrim(NEW.name) ELSE name END,
   name_status=CASE WHEN name_status='missing' AND ok THEN 'provisional' ELSE name_status END
  WHERE id=cid AND (profile_name IS DISTINCT FROM NEW.name OR name_status='missing');
 END IF;
 NEW.customer_id=cid; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.wa_link_customer() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wa_link_customer BEFORE INSERT OR UPDATE OF name,phone ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.wa_link_customer();

-- a name the customer gives during an order confirms the record
CREATE OR REPLACE FUNCTION public.wa_order_confirms_name() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n text=btrim(coalesce(NEW.request->>'customer','')); BEGIN
 IF public.valid_person_name(n) THEN
  UPDATE public.pdv_customers c SET name=n,name_status='confirmed',updated_at=now() FROM public.whatsapp_conversations w WHERE w.phone=NEW.phone AND c.id=w.customer_id AND c.name_status<>'confirmed';
 END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.wa_order_confirms_name() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wa_order_confirms_name AFTER INSERT ON public.whatsapp_order_requests FOR EACH ROW EXECUTE FUNCTION public.wa_order_confirms_name();

-- staff read of the customer behind a conversation
CREATE OR REPLACE FUNCTION public.wa_customer_card(_phone text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.pdv_customers; BEGIN
 IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT p.* INTO c FROM public.whatsapp_conversations w JOIN public.pdv_customers p ON p.id=w.customer_id WHERE w.phone=_phone;
 IF c.id IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone,'nameStatus',c.name_status,'profileName',c.profile_name,
  'contactStatus',CASE WHEN public.has_role(auth.uid(),'admin') THEN c.contact_sync_status END,
  'updatedByName',c.updated_by_name,
  'addresses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'address',a.address,'updatedAt',a.updated_at) ORDER BY a.updated_at DESC) FROM public.delivery_addresses a WHERE a.customer_id=c.id),'[]'),
  'orders',coalesce((SELECT jsonb_agg(x ORDER BY x->>'at' DESC) FROM (
     SELECT jsonb_build_object('ref',coalesce(r.public_code,'#'||r.order_number::text,'WhatsApp'),'status',r.status,'at',r.created_at) x FROM public.whatsapp_order_requests r WHERE r.phone=_phone
     UNION ALL SELECT jsonb_build_object('ref','Entrega','status',d.status,'at',d.created_at) FROM public.delivery_orders d WHERE d.customer_id=c.id ORDER BY 1 DESC LIMIT 10) s),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.wa_customer_card(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.wa_customer_card(text) TO authenticated;

-- staff correction of name/phone with duplicate check and audit
CREATE OR REPLACE FUNCTION public.update_customer_identity(_id uuid,_name text,_phone text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.pdv_customers; np text; who text; BEGIN
 IF NOT public.wa_staff() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT * INTO c FROM public.pdv_customers WHERE id=_id FOR UPDATE; IF c.id IS NULL THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
 IF NOT public.valid_person_name(_name) THEN RAISE EXCEPTION 'Informe um nome válido'; END IF;
 np=public.normalize_phone(_phone); IF np IS NULL THEN RAISE EXCEPTION 'Telefone inválido. Informe país e DDD'; END IF;
 IF EXISTS(SELECT 1 FROM public.pdv_customers WHERE phone=np AND id<>_id) THEN RAISE EXCEPTION 'Já existe outro cliente com este telefone'; END IF;
 SELECT display_name INTO who FROM public.profiles WHERE id=auth.uid();
 IF btrim(_name) IS DISTINCT FROM c.name THEN INSERT INTO public.customer_identity_changes(customer_id,field,old_value,new_value,changed_by,changed_by_name) VALUES(_id,'name',c.name,btrim(_name),auth.uid(),who); END IF;
 IF np IS DISTINCT FROM c.phone THEN INSERT INTO public.customer_identity_changes(customer_id,field,old_value,new_value,changed_by,changed_by_name) VALUES(_id,'phone',c.phone,np,auth.uid(),who); END IF;
 UPDATE public.pdv_customers SET name=btrim(_name),phone=np,name_status='confirmed',updated_by=auth.uid(),updated_by_name=who,updated_at=now(),
  contact_sync_status=CASE WHEN contact_sync_status IN ('saved','failed','review') AND (np IS DISTINCT FROM c.phone OR btrim(_name) IS DISTINCT FROM c.name) THEN 'review' ELSE contact_sync_status END WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.update_customer_identity(uuid,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.update_customer_identity(uuid,text,text) TO authenticated;

-- link existing conversations
UPDATE public.whatsapp_conversations SET name=name;