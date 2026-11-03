CREATE OR REPLACE FUNCTION public.guard_terminal_pdv_orders() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o jsonb; prev jsonb;
BEGIN
 FOR o IN SELECT value FROM jsonb_array_elements(NEW.data->'orders') LOOP
 SELECT value INTO prev FROM jsonb_array_elements(OLD.data->'orders') WHERE value->>'id'=o->>'id';
 IF prev->>'status'='cancelado' AND o->>'status'<>'cancelado' THEN RAISE EXCEPTION 'Pedido cancelado não pode ser reaberto'; END IF;
 IF o->>'status'='cancelado' AND prev->>'status' IS DISTINCT FROM 'cancelado' THEN
 UPDATE public.whatsapp_order_requests SET status='cancelled',closed_reason=coalesce(o->>'closedReason','Cancelado no PDV'),closed_at=now(),closed_by=auth.uid(),closed_by_name=o->>'closedByName',updated_at=now() WHERE order_id=o->>'id' AND status NOT IN ('rejected','cancelled');
 UPDATE public.whatsapp_jobs SET state='cancelled',lease_until=NULL WHERE state IN ('pending','running') AND (payload->>'orderId'=o->>'id' OR payload->>'requestId' IN (SELECT id::text FROM public.whatsapp_order_requests WHERE order_id=o->>'id'));
 END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.data->'orders') old_o(v) WHERE v->>'status'='cancelado' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.data->'orders') new_o(w) WHERE w->>'id'=v->>'id')) THEN RAISE EXCEPTION 'Preserve o histórico dos pedidos cancelados'; END IF;
 RETURN NEW;
END $$;