import type { Order } from './pdv-store';
export const TABLES = [1, 2, 3, 4, 5] as const;
export const validTable = (n: unknown): n is number => typeof n === 'number' && TABLES.some(t => t === n);
export function tableLabel(order: { type: string; tableNumber?: number | null | undefined; customer: string }) {
  return order.type === 'Mesa' ? validTable(order.tableNumber) ? `Mesa ${order.tableNumber}` : order.customer ? `Mesa · ${order.customer}` : 'Mesa não informada' : order.type;
}
export function tableOrders(orders: Order[], table: number) {
  return orders.filter(o => o.type === 'Mesa' && o.tableNumber === table && ['cozinha','pronto','aberta'].includes(o.status));
}