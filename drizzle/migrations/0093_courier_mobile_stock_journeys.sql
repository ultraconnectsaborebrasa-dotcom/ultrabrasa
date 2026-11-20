ALTER TABLE public.delivery_couriers
 ADD COLUMN IF NOT EXISTS operational_status text NOT NULL DEFAULT 'available',
 ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.courier_marmita_stock
 ADD COLUMN IF NOT EXISTS product_id text NOT NULL DEFAULT 'product-marmita-completa',
 ADD COLUMN IF NOT EXISTS product_name text NOT NULL DEFAULT 'Marmita completa',
 ADD COLUMN IF NOT EXISTS journey_id uuid,
 ADD COLUMN IF NOT EXISTS current_load_id uuid,
 ADD COLUMN IF NOT EXISTS journey_status text NOT NULL DEFAULT 'on_route';

ALTER TABLE public.courier_marmita_movements
 ADD COLUMN IF NOT EXISTS journey_id uuid,
 ADD COLUMN IF NOT EXISTS load_id uuid,
 ADD COLUMN IF NOT EXISTS product_id text,
 ADD COLUMN IF NOT EXISTS reason text;

CREATE TABLE public.courier_marmita_loads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 journey_id uuid NOT NULL,
 courier_id uuid NOT NULL REFERENCES public.delivery_couriers(id) ON DELETE CASCADE,
 product_id text NOT NULL,
 product_name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('load','replenishment')),
 quantity integer NOT NULL CHECK(quantity > 0 AND quantity <= 999),
 returned_quantity integer NOT NULL DEFAULT 0 CHECK(returned_quantity >= 0),
 loss_quantity integer NOT NULL DEFAULT 0 CHECK(loss_quantity >= 0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','returned')),
 reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid
);
GRANT SELECT ON public.courier_marmita_loads TO authenticated;
GRANT ALL ON public.courier_marmita_loads TO service_role;
ALTER TABLE public.courier_marmita_loads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read courier loads" ON public.courier_marmita_loads FOR SELECT TO authenticated
 USING(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));
CREATE POLICY "Courier reads own loads" ON public.courier_marmita_loads FOR SELECT TO authenticated
 USING(public.has_role(auth.uid(),'courier') AND EXISTS(SELECT 1 FROM public.delivery_couriers c WHERE c.id=courier_id AND c.user_id=auth.uid() AND c.active));
CREATE INDEX courier_marmita_loads_journey_idx ON public.courier_marmita_loads(journey_id,created_at);
CREATE INDEX courier_marmita_loads_courier_idx ON public.courier_marmita_loads(courier_id,created_at DESC);

UPDATE public.courier_marmita_stock SET journey_id=gen_random_uuid() WHERE journey_id IS NULL;
INSERT INTO public.courier_marmita_loads(journey_id,courier_id,product_id,product_name,kind,quantity,status,created_at,created_by)
SELECT s.journey_id,s.courier_id,s.product_id,s.product_name,'load',s.initial_quantity,CASE WHEN s.journey_status='returned' THEN 'returned' ELSE 'active' END,s.updated_at,s.updated_by
FROM public.courier_marmita_stock s
WHERE s.initial_quantity>0
ON CONFLICT DO NOTHING;
UPDATE public.courier_marmita_stock s SET current_load_id=(SELECT l.id FROM public.courier_marmita_loads l WHERE l.journey_id=s.journey_id ORDER BY l.created_at DESC,l.id DESC LIMIT 1) WHERE current_load_id IS NULL;
UPDATE public.courier_marmita_movements m SET journey_id=s.journey_id,product_id=s.product_id FROM public.courier_marmita_stock s WHERE s.courier_id=m.courier_id AND m.journey_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_courier_availability(p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE target uuid; manager boolean;
BEGIN
 manager=public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier');
 IF p_status NOT IN ('available','unavailable','returning') THEN RAISE EXCEPTION 'Disponibilidade inválida'; END IF;
 IF manager THEN
  RAISE EXCEPTION 'Informe o entregador pela operação administrativa';
 END IF;
 SELECT id INTO target FROM public.delivery_couriers WHERE user_id=auth.uid() AND active;
 IF target IS NULL THEN RAISE EXCEPTION 'Vincule esta conta a um entregador ativo'; END IF;
 UPDATE public.delivery_couriers SET operational_status=p_status,status_updated_at=now() WHERE id=target;
END;
$$;
REVOKE ALL ON FUNCTION public.set_courier_availability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_courier_availability(text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_courier_marmita_stock(p_courier_id uuid,p_quantity integer,p_mode text DEFAULT 'load',p_product_id text DEFAULT 'product-marmita-completa',p_product_name text DEFAULT 'Marmita completa',p_reason text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
 previous public.courier_marmita_stock;
 reserved integer;
 next_remaining integer;
 next_initial integer;
 next_journey uuid;
 next_load uuid;
 next_product text;
 next_product_name text;
 next_status text;
 change integer;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) THEN RAISE EXCEPTION 'Somente o administrador ou o caixa pode registrar a carga'; END IF;
 IF p_quantity IS NULL OR p_quantity<0 OR p_quantity>999 OR p_mode NOT IN ('load','replenish','return','loss','correct') THEN RAISE EXCEPTION 'Informe uma quantidade válida entre 0 e 999'; END IF;
 IF p_mode IN ('loss','correct') AND length(trim(p_reason))<3 THEN RAISE EXCEPTION 'Informe uma justificativa com pelo menos 3 caracteres'; END IF;
 IF p_mode IN ('load','replenish') AND p_quantity=0 THEN RAISE EXCEPTION 'A carga ou reposição precisa ter pelo menos 1 marmita'; END IF;
 IF p_mode='load' AND (trim(p_product_id)='' OR trim(p_product_name)='') THEN RAISE EXCEPTION 'Informe o tipo de marmita da carga'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_couriers WHERE id=p_courier_id AND active) THEN RAISE EXCEPTION 'Entregador indisponível'; END IF;
 PERFORM pg_advisory_xact_lock(742021);
 SELECT coalesce(sum(public.delivery_marmita_quantity(d.order_id)),0)::integer INTO reserved
 FROM public.delivery_orders d LEFT JOIN public.delivery_routes r ON r.id=d.route_id
 WHERE d.status NOT IN ('Entregue','Cancelado') AND coalesce(r.courier_id,d.assigned_courier_id)=p_courier_id;
 SELECT * INTO previous FROM public.courier_marmita_stock WHERE courier_id=p_courier_id FOR UPDATE;

 IF p_mode='load' THEN
  IF reserved>0 THEN RAISE EXCEPTION 'Este entregador tem % marmita(s) reservada(s). Conclua ou transfira as entregas antes de nova jornada.',reserved; END IF;
  IF previous.courier_id IS NOT NULL AND previous.remaining_quantity>0 AND previous.journey_status='on_route' THEN RAISE EXCEPTION 'Ainda há % marmita(s) na carga atual. Use Reposição ou registre o Retorno.',previous.remaining_quantity; END IF;
  next_remaining=p_quantity; next_initial=p_quantity; next_journey=gen_random_uuid(); next_product=p_product_id; next_product_name=trim(p_product_name); next_status='on_route'; change=p_quantity;
  INSERT INTO public.courier_marmita_loads(journey_id,courier_id,product_id,product_name,kind,quantity,created_by)
  VALUES(next_journey,p_courier_id,next_product,next_product_name,'load',p_quantity,auth.uid()) RETURNING id INTO next_load;
 ELSE
  IF previous.courier_id IS NULL THEN RAISE EXCEPTION 'Registre a primeira carga antes desta operação'; END IF;
  next_journey=coalesce(previous.journey_id,gen_random_uuid()); next_product=previous.product_id; next_product_name=previous.product_name; next_load=previous.current_load_id;
  IF p_mode='replenish' THEN
   IF previous.journey_status<>'on_route' THEN RAISE EXCEPTION 'Registre uma nova carga para iniciar outra jornada'; END IF;
   IF trim(p_product_id)<>previous.product_id THEN RAISE EXCEPTION 'A reposição precisa ser do mesmo tipo da carga atual: %',previous.product_name; END IF;
   next_remaining=previous.remaining_quantity+p_quantity; next_initial=previous.initial_quantity+p_quantity; next_status='on_route'; change=p_quantity;
   INSERT INTO public.courier_marmita_loads(journey_id,courier_id,product_id,product_name,kind,quantity,reason,created_by)
   VALUES(next_journey,p_courier_id,next_product,next_product_name,'replenishment',p_quantity,nullif(trim(p_reason),''),auth.uid()) RETURNING id INTO next_load;
  ELSIF p_mode='return' THEN
   IF reserved>0 THEN RAISE EXCEPTION 'Este entregador tem % marmita(s) reservada(s). Conclua, cancele ou transfira as entregas antes do retorno.',reserved; END IF;
   IF p_quantity<>previous.remaining_quantity THEN RAISE EXCEPTION 'Confira a devolução: o sistema espera % marmita(s) física(s) com o entregador',previous.remaining_quantity; END IF;
   next_remaining=0; next_initial=previous.initial_quantity; next_status='returned'; change=-previous.remaining_quantity;
   UPDATE public.courier_marmita_loads SET status='returned',returned_quantity=CASE WHEN id=next_load THEN p_quantity ELSE returned_quantity END WHERE journey_id=next_journey;
  ELSIF p_mode='loss' THEN
   IF p_quantity=0 OR p_quantity>previous.remaining_quantity-reserved THEN RAISE EXCEPTION 'A perda precisa ser maior que zero e não pode atingir marmitas reservadas'; END IF;
   next_remaining=previous.remaining_quantity-p_quantity; next_initial=previous.initial_quantity; next_status=CASE WHEN next_remaining=0 THEN 'empty' ELSE previous.journey_status END; change=-p_quantity;
   UPDATE public.courier_marmita_loads SET loss_quantity=loss_quantity+p_quantity WHERE id=next_load;
  ELSE
   IF p_quantity<reserved THEN RAISE EXCEPTION 'O saldo físico não pode ser menor que as % marmita(s) reservada(s)',reserved; END IF;
   next_remaining=p_quantity; next_initial=previous.initial_quantity; next_status=CASE WHEN p_quantity=0 THEN 'empty' WHEN previous.journey_status='returned' AND p_quantity>0 THEN 'on_route' ELSE previous.journey_status END; change=p_quantity-previous.remaining_quantity;
  END IF;
 END IF;

 INSERT INTO public.courier_marmita_stock(courier_id,initial_quantity,remaining_quantity,updated_by,product_id,product_name,journey_id,current_load_id,journey_status)
 VALUES(p_courier_id,next_initial,next_remaining,auth.uid(),next_product,next_product_name,next_journey,next_load,next_status)
 ON CONFLICT(courier_id) DO UPDATE SET initial_quantity=EXCLUDED.initial_quantity,remaining_quantity=EXCLUDED.remaining_quantity,updated_at=now(),updated_by=auth.uid(),product_id=EXCLUDED.product_id,product_name=EXCLUDED.product_name,journey_id=EXCLUDED.journey_id,current_load_id=EXCLUDED.current_load_id,journey_status=EXCLUDED.journey_status;
 INSERT INTO public.courier_marmita_movements(courier_id,quantity_change,resulting_quantity,kind,actor_id,journey_id,load_id,product_id,reason)
 VALUES(p_courier_id,change,next_remaining,p_mode,auth.uid(),next_journey,next_load,next_product,nullif(trim(p_reason),''));
 UPDATE public.delivery_couriers SET operational_status=CASE WHEN p_mode IN ('load','replenish') THEN 'available' WHEN p_mode='return' THEN 'unavailable' ELSE operational_status END,status_updated_at=now() WHERE id=p_courier_id;
END;
$$;