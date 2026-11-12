create or replace function public.close_receipts_for_paid_orders() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.payment_receipts r set state='confirmed', reviewed_at=now(), reason='Pedido marcado como pago no PDV'
  where r.state in ('review','unverified') and r.order_id is not null
    and exists (select 1 from jsonb_array_elements(coalesce(new.data->'orders','[]'::jsonb)) o where o->>'id'=r.order_id and o->>'paymentStatus'='pago');
  return new;
end $$;
revoke all on function public.close_receipts_for_paid_orders() from public, anon, authenticated;
drop trigger if exists close_receipts_for_paid_orders on public.pdv_state;
create trigger close_receipts_for_paid_orders after update on public.pdv_state for each row execute function public.close_receipts_for_paid_orders();
update public.payment_receipts set state='confirmed', reviewed_at=now(), reason='Conferido em lote pela administração' where state in ('review','unverified');