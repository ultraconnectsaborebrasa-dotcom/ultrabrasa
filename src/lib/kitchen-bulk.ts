import { supabase } from '@/integrations/supabase/client';

export type KitchenBulkAction = 'ready' | 'finish';

export function kitchenBulkDestination(order: { status: string; type: string }, action: KitchenBulkAction) {
  if (action === 'ready') return order.status === 'cozinha' ? 'pronto' : null;
  if (!['aberta', 'cozinha', 'pronto', 'entrega'].includes(order.status)) return null;
  return order.type === 'Delivery' ? 'entregue' : 'retirado';
}

export async function runKitchenBulkAction(action: KitchenBulkAction) {
  const { data, error } = await supabase.rpc('bulk_advance_pdv_cashier_orders' as never, { action } as never);
  if (error) throw error;
  return Number(data ?? 0);
}
