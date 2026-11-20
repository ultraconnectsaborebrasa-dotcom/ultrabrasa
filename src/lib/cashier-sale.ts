import { supabase } from '@/integrations/supabase/client';

export type CashierSaleResult = { number: number; id?: string; status?: string };

export async function submitCashierSale(
  request: Record<string, unknown>,
  paymentMethod?: string,
  destination: 'kitchen' | 'direct' = 'kitchen',
): Promise<CashierSaleResult> {
  const paid = Boolean(paymentMethod);
  if (destination === 'direct' && !paid) throw new Error('Selecione a forma de pagamento');
  const functionName = destination === 'direct'
    ? 'submit_pdv_cashier_direct_paid'
    : paid ? 'submit_pdv_cashier_paid' : 'submit_pdv_operator_with_contact';
  const { data, error } = await supabase.rpc(
    functionName as never,
    (paid ? { request, payment_method: paymentMethod } : { request }) as never,
  );
  if (error) throw error;
  return data as unknown as CashierSaleResult;
}
