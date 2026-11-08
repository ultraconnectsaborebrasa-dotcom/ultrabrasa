const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
export function storeDay(value: string | number | Date = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = dayFormatter.formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-');
}
export function storeDayStart(now = Date.now()) { return `${storeDay(now)}T00:00:00-03:00`; }
export function isStoreToday(value: string | number, now = Date.now()) { return storeDay(value) === storeDay(now); }
export function pendingPayment(order: { status: string; paymentStatus?: string; hasPayment?: boolean; total: number }) {
  return order.status !== 'cancelado' && order.status !== 'pago' && order.paymentStatus !== 'pago' && !order.hasPayment && order.total > 0;
}