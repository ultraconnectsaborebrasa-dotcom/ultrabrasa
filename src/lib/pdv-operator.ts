import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type OperatorProduct = { id: string; name: string; category: string; stock: number | null; price: number | null };
export type OperatorItem = { productId: string; qty: number; note: string };
export type OperatorOrder = { id: string; number: number; type: string; tableNumber?: number; customer: string; customerPhone?: string; status: string; note: string; createdAt: number; own: boolean; total: number | null; items: { name: string; qty: number; price: number | null; note: string }[] };
export type OperatorHistoryOrder = Omit<OperatorOrder, 'items' | 'total' | 'own'> & { paidAt?: number; items: { name: string; qty: number; note: string }[] };
export type OperatorData = { products: OperatorProduct[]; orders: OperatorOrder[]; history?: OperatorHistoryOrder[]; ownSales: number; ownOrders: number };
export const emptyOperator: OperatorData = { products: [], orders: [], ownSales: 0, ownOrders: 0 };
export async function readOperator(): Promise<OperatorData> {
  const { data, error } = await supabase.rpc('read_pdv_operator');
  if (error) throw new Error(error.message);
  return data as unknown as OperatorData;
}
export async function submitOperator(request: { id: string; type: string; tableNumber?: number | undefined; customer: string; customerPhone?: string; promotionConsent?: boolean; note: string; items: OperatorItem[]; source: string }) {
  const { data, error } = await supabase.rpc('submit_pdv_operator_with_contact', { request: request as unknown as Json });
  if (error) throw new Error(error.message);
  return data as unknown as { number: number };
}
export function operatorSubtotal(items: { price: number | null; qty: number }[]): number | null {
  if (items.some(i => i.price === null || !Number.isFinite(i.price))) return null;
  return Math.round(items.reduce((sum, i) => sum + (i.price ?? 0) * i.qty, 0) * 100) / 100;
}
