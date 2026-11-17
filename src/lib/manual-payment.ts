import { supabase } from '@/integrations/supabase/client';

export async function submitManualPayment(
  orderId: string,
  paymentMethod: string,
  markReady = false,
): Promise<void> {
  const { error } = await supabase.rpc(
    (markReady ? 'pay_pdv_kitchen' : 'pay_pdv_cashier') as never,
    { order_id: orderId, payment_method: paymentMethod } as never,
  );
  if (error) throw error;
}
