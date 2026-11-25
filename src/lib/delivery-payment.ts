import { supabase } from '@/integrations/supabase/client';
import type { QueryClient } from '@tanstack/react-query';

export type DeliveryReceivable = {
  id: string; number: number; customer: string; total: number; status: string;
  courier_id: string | null; courier_name: string | null; method: string;
  note: string; items: { name: string; qty: number; note: string }[];
};
export type DeliveryReceivables = { orders: DeliveryReceivable[]; methods: string[] };
export const deliveryReceivablesQuery = (date: string) => ({
  queryKey: ['delivery-receivables', date],
  queryFn: async (): Promise<DeliveryReceivables> => {
    const { data, error } = await supabase.rpc('read_delivery_receivables', { p_day: date });
    if (error) throw new Error(error.message);
    return data as unknown as DeliveryReceivables;
  },
  refetchInterval: 5000,
  gcTime: 0,
});

export async function refreshDeliveryPayments(client: QueryClient) {
  await Promise.all(['delivery-board', 'courier-settlement', 'delivery-receivables'].map(key => client.invalidateQueries({ queryKey: [key] })));
}