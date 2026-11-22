export type OpenOrderEditItem = { price: number; qty: number };
export type OpenOrderEditState = {
  status: string;
  paymentStatus?: string | undefined;
  hasPayment?: boolean | undefined;
  payments?: unknown[] | undefined;
};

export function canEditOpenOrder(order: OpenOrderEditState) {
  return ['aberta', 'cozinha', 'pronto'].includes(order.status)
    && order.paymentStatus !== 'pago'
    && order.hasPayment !== true
    && !(order.payments?.length);
}

export function openOrderTotals(order: { items: OpenOrderEditItem[]; discount?: number | undefined; fee?: number | undefined; serviceFee?: boolean | undefined }, serviceFeePct: number) {
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const service = order.serviceFee ? Math.round(subtotal * serviceFeePct) / 100 : 0;
  const discount = order.discount ?? 0;
  const fee = order.fee ?? 0;
  return { subtotal, service, total: Math.max(0, subtotal - discount + fee + service) };
}
