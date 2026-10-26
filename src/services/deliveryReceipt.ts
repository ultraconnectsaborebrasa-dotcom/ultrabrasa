import { supabase } from '@/integrations/supabase/client';
import type { Delivery } from '@/lib/delivery';
import type { Order } from '@/lib/pdv-store';

// Limited role-specific order lists omit addresses; reuse the authorized delivery read.
export async function receiptOrderWithDelivery(order: Order): Promise<Order> {
  if (order.type !== 'Delivery' || order.delivery?.address) return order;
  const { data, error } = await supabase.rpc('read_delivery_board' as never);
  if (error) throw new Error('Não foi possível carregar o endereço da entrega. Tente novamente.');
  const board = data as unknown as { deliveries?: Delivery[] } | null;
  const delivery = board?.deliveries?.find(d => d.order_id === order.id);
  if (!delivery?.address) throw new Error('Pedido Delivery sem endereço cadastrado. Confira o endereço em Rotas antes de imprimir.');
  return {
    ...order,
    customerPhone: order.customerPhone || delivery.phone,
    delivery: { address: delivery.address, paymentMethod: delivery.payment_method, cashFor: '' },
  };
}