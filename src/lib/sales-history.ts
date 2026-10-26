import { paid, type Order } from './pdv-store';
export const saleTime = (o: Order) => o.paidAt ?? o.createdAt;
export const paidSalesSince = (orders: Order[], since: number) => orders.filter(o => o.status === 'pago' && saleTime(o) >= since);
export function filterSales(orders: Order[], from: string, to: string) {
  const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const end = to ? new Date(`${to}T00:00:00`).getTime() : Infinity;
  const until = Number.isFinite(end) ? new Date(end).setDate(new Date(end).getDate() + 1) : end;
  if (Number.isNaN(start) || Number.isNaN(until) || start >= until) return [];
  return orders.filter(o => ['pago', 'cancelado'].includes(o.status) && saleTime(o) >= start && saleTime(o) < until).sort((a,b) => saleTime(b)-saleTime(a));
}
export function summarizeSales(orders: Order[]) {
  const sales = orders.filter(o => o.status === 'pago');
  const products = new Map<string,{id:string; name:string; qty:number; amount:number}>();
  const methods = new Map<string, number>();
  const days = new Map<string, {date:string; count:number; units:number; revenue:number}>();
  sales.forEach(o => o.items.forEach(i => {
    const row = products.get(i.productId) ?? {id:i.productId,name:i.name,qty:0,amount:0};
    row.qty += i.qty; row.amount += i.qty*i.price; products.set(i.productId,row);
  }));
  sales.forEach(o => {
    o.payments.forEach(p => methods.set(p.method, (methods.get(p.method) ?? 0) + p.amount));
    const date = dateInput(new Date(saleTime(o)));
    const day = days.get(date) ?? {date, count:0, units:0, revenue:0};
    day.count += 1; day.units += o.items.reduce((n,i) => n+i.qty,0); day.revenue += paid(o);
    days.set(date, day);
  });
  const revenue = sales.reduce((n,o) => n+paid(o),0);
  return {count:sales.length,revenue,units:sales.reduce((n,o) => n+o.items.reduce((v,i)=>v+i.qty,0),0),ticket:sales.length?revenue/sales.length:0,products:[...products.values()].sort((a,b)=>b.qty-a.qty),payments:[...methods].map(([method,amount])=>({method,amount})).sort((a,b)=>b.amount-a.amount),days:[...days.values()].sort((a,b)=>b.date.localeCompare(a.date))};
}
export const dateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
