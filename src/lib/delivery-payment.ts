import { supabase } from '@/integrations/supabase/client';
import type { QueryClient } from '@tanstack/react-query';

export type DeliveryReceivable = {
  id: string; number: number; customer: string; total: number; status: string;
  courier_id: string | null; courier_name: string | null; method: string;
  note: string; items: { name: string; qty: number; note: string }[];
  customer_paid_reported_at?: string | null;
};
export type DeliveryReceivables = { orders: DeliveryReceivable[]; methods: string[] };
export const deliveryReceivablesQuery = (date: string) => ({
  queryKey: ['delivery-receivables', date],
  queryFn: async (): Promise<DeliveryReceivables> => {
    const { data, error } = await supabase.rpc('read_delivery_payment_review', { p_day: date });
    if (error) throw new Error(error.message);
    return data as unknown as DeliveryReceivables;
  },
  refetchInterval: 5000,
  gcTime: 0,
});

export async function reportCustomerPaid(orderId: string) {
  const { error } = await supabase.rpc('report_delivery_customer_paid', { p_order_id: orderId });
  if (error) throw new Error(error.message);
}

export async function rejectCustomerPaid(orderId: string) {
  const { error } = await supabase.rpc('reject_delivery_customer_paid', { p_order_id: orderId });
  if (error) throw new Error(error.message);
}

export async function refreshDeliveryPayments(client: QueryClient) {
  await Promise.all(['delivery-board', 'courier-settlement', 'delivery-receivables'].map(key => client.invalidateQueries({ queryKey: [key] })));
}