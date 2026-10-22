import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type OperatorProduct = { id: string; name: string; category: string; stock: number | null };
export type OperatorItem = { productId: string; qty: number; note: string };
export type OperatorOrder = { id: string; number: number; type: string; tableNumber?: number; customer: string; status: string; note: string; createdAt: number; own: boolean; items: { name: string; qty: number; note: string }[] };
export type OperatorData = { products: OperatorProduct[]; orders: OperatorOrder[]; ownSales: number; ownOrders: number };
export const emptyOperator: OperatorData = { products: [], orders: [], ownSales: 0, ownOrders: 0 };
export async function readOperator(): Promise<OperatorData> {
  const { data, error } = await supabase.rpc('read_pdv_operator');
  if (error) throw new Error(error.message);
  return data as unknown as OperatorData;
}
export async function submitOperator(request: { id: string; type: string; tableNumber?: number | undefined; customer: string; note: string; items: OperatorItem[]; source: string }) {
  const { data, error } = await supabase.rpc('submit_pdv_operator', { request: request as unknown as Json });
  if (error) throw new Error(error.message);
  return data as unknown as { number: number };
}