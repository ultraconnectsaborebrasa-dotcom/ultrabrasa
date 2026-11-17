import { supabase } from '@/integrations/supabase/client';

export type CashierSaleResult = { number: number; id?: string };

export async function submitCashierSale(
  request: Record<string, unknown>,
  paymentMethod?: string,
): Promise<CashierSaleResult> {
  const paid = Boolean(paymentMethod);
  const { data, error } = await supabase.rpc(
    (paid ? 'submit_pdv_cashier_paid' : 'submit_pdv_operator_with_contact') as never,
    (paid ? { request, payment_method: paymentMethod } : { request }) as never,
  );
  if (error) throw error;
  return data as unknown as CashierSaleResult;
}
