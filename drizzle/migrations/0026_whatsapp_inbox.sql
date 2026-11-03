CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_events_pending ON public.whatsapp_webhook_events (next_attempt_at) WHERE processed_at IS NULL;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read wa events" ON public.whatsapp_webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.whatsapp_conversations (
  phone text PRIMARY KEY,
  name text,
  customer_id uuid,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message text,
  unread int NOT NULL DEFAULT 0,
  last_inbound_at timestamptz,
  last_auto_reply_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_conversations TO service_role;
GRANT SELECT, UPDATE ON public.whatsapp_conversations TO authenticated;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read wa conv" ON public.whatsapp_conversations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update wa conv" ON public.whatsapp_conversations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text UNIQUE,
  phone text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  source text NOT NULL DEFAULT 'pdv',
  kind text NOT NULL DEFAULT 'text',
  body text,
  media_id text,
  status text NOT NULL DEFAULT 'received',
  error text,
  order_id text,
  reply_to text UNIQUE,
  sent_by uuid,
  sent_at timestamptz, delivered_at timestamptz, read_at timestamptz, failed_at timestamptz,
  provider_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_messages_phone ON public.whatsapp_messages (phone, provider_at);
GRANT ALL ON public.whatsapp_messages TO service_role;
GRANT SELECT ON public.whatsapp_messages TO authenticated;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read wa msg" ON public.whatsapp_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.whatsapp_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_reply_enabled boolean NOT NULL DEFAULT false,
  auto_reply_text text NOT NULL DEFAULT 'Olá! Recebemos sua mensagem na Ultraconnect Sabor e Brasa. Já vamos te responder.',
  quick_replies jsonb NOT NULL DEFAULT '["Seu pedido foi recebido!","Seu pedido está pronto para retirada.","Seu pedido saiu para entrega.","Qual a forma de pagamento?"]',
  account_state text NOT NULL DEFAULT 'ok',
  account_event text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.whatsapp_settings (id) VALUES (1);
GRANT ALL ON public.whatsapp_settings TO service_role;
GRANT SELECT, UPDATE ON public.whatsapp_settings TO authenticated;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read wa settings" ON public.whatsapp_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update wa settings" ON public.whatsapp_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.whatsapp_pending_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text NOT NULL,
  status text NOT NULL,
  provider_at timestamptz NOT NULL,
  errors jsonb,
  UNIQUE (wa_message_id, status)
);
GRANT ALL ON public.whatsapp_pending_statuses TO service_role;
ALTER TABLE public.whatsapp_pending_statuses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.wa_apply_status(_id text, _status text, _at timestamptz, _errors jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r int := CASE _status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 ELSE 0 END;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM whatsapp_messages WHERE wa_message_id = _id) THEN
    INSERT INTO whatsapp_pending_statuses (wa_message_id, status, provider_at, errors) VALUES (_id, _status, _at, _errors)
    ON CONFLICT (wa_message_id, status) DO NOTHING;
    RETURN false;
  END IF;
  UPDATE whatsapp_messages SET
    sent_at = CASE WHEN _status='sent' THEN coalesce(sent_at,_at) ELSE sent_at END,
    delivered_at = CASE WHEN _status='delivered' THEN coalesce(delivered_at,_at) ELSE delivered_at END,
    read_at = CASE WHEN _status='read' THEN coalesce(read_at,_at) ELSE read_at END,
    failed_at = CASE WHEN _status='failed' THEN coalesce(failed_at,_at) ELSE failed_at END,
    error = CASE WHEN _status='failed' THEN coalesce(_errors::text, error) ELSE error END,
    status = CASE WHEN r > (CASE status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 ELSE 0 END) THEN _status ELSE status END
  WHERE wa_message_id = _id;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.wa_reconcile(_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  FOR p IN SELECT * FROM whatsapp_pending_statuses WHERE wa_message_id = _id ORDER BY provider_at LOOP
    PERFORM wa_apply_status(p.wa_message_id, p.status, p.provider_at, p.errors);
    DELETE FROM whatsapp_pending_statuses WHERE id = p.id;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.wa_apply_status(text,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_reconcile(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_apply_status(text,text,timestamptz,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_reconcile(text) TO service_role;