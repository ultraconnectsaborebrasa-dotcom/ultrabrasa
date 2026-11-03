export type CatalogProduct = {
  id: string; name: string; category: string; price: number; available: boolean;
  description: string; image: string | null; illustrative: boolean; featured: boolean; sort: number;
};
export type CatalogSettings = {
  lunchStart?: string; lunchEnd?: string; nightStart?: string; nightEnd?: string;
  deliveryStart?: string; freeDeliveryEunapolis?: boolean;
};
export type PublicCatalog = { settings: CatalogSettings | null; products: CatalogProduct[] };

export const CATEGORY_ORDER = ['Marmitas', 'Hambúrgueres', 'Espetinhos', 'Acompanhamentos', 'Porções', 'Salgados', 'Lanches', 'Bebidas'];

export function normalizeCategory(c: string) {
  const t = c.trim();
  const hit = CATEGORY_ORDER.find((x) => x.toLowerCase() === t.toLowerCase());
  return hit ?? (t.charAt(0).toUpperCase() + t.slice(1));
}

/** Groups products by category, keeping only categories with products, in menu order. */
export function groupCatalog(products: CatalogProduct[]) {
  const map = new Map<string, CatalogProduct[]>();
  for (const p of products) {
    const c = normalizeCategory(p.category);
    map.set(c, [...(map.get(c) ?? []), p]);
  }
  const rank = (c: string) => { const i = CATEGORY_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

const toMin = (hhmm = '00:00') => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Minutes since midnight in America/Bahia. */
export function bahiaMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export type Period = 'lunch' | 'night' | 'closed';
export function currentPeriod(s: CatalogSettings | null, now = new Date()): Period {
  const t = bahiaMinutes(now);
  if (t >= toMin(s?.lunchStart ?? '10:00') && t < toMin(s?.lunchEnd ?? '15:00')) return 'lunch';
  const ns = toMin(s?.nightStart ?? '18:00'), ne = toMin(s?.nightEnd ?? '23:30');
  if (ns <= ne ? t >= ns && t < ne : t >= ns || t < ne) return 'night';
  return 'closed';
}

export const HIGHLIGHT: Record<Exclude<Period, 'closed'>, string[]> = {
  lunch: ['Marmitas'],
  night: ['Hambúrgueres', 'Espetinhos'],
};

export const STORE_WHATSAPP = '5573982423404';
export type CartLine = { productId: string; name: string; price: number; qty: number; note: string };
export type PaymentChoice = 'Pix' | 'Crédito' | 'Débito' | 'Dinheiro';
export type CheckoutForm = {
  customer: string; phone: string; type: 'Delivery' | 'Retirada';
  address: { street: string; number: string; neighborhood: string; complement: string; reference: string };
  requestedTime: string; payment: PaymentChoice | null; needChange: boolean; cashFor: string; note: string;
};

const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Returns the first validation problem, or null when the checkout can be submitted. */
export function validateCheckout(f: CheckoutForm, cart: CartLine[]): string | null {
  if (!cart.length) return 'Adicione itens ao carrinho';
  if (f.customer.trim().length < 2) return 'Informe seu nome';
  const d = f.phone.replace(/\D/g, '');
  if (!(d.length === 10 || d.length === 11 || /^55\d{10,11}$/.test(d))) return 'Informe um WhatsApp válido com DDD';
  if (f.type === 'Delivery' && (!f.address.street.trim() || !f.address.number.trim() || !f.address.neighborhood.trim())) return 'Informe rua, número e bairro';
  if (!f.payment) return 'Escolha a forma de pagamento';
  if (f.payment === 'Dinheiro' && f.needChange) {
    const c = Number(f.cashFor.replace(',', '.'));
    if (!(c > cartTotal(cart))) return 'Troco: informe um valor maior que o total';
  }
  return null;
}

export const cartTotal = (cart: CartLine[]) => cart.reduce((s, l) => s + l.price * l.qty, 0);

/** WhatsApp summary text. Payment is always reported as pending: choosing a method is not paying. */
export function buildOrderMessage(code: string, f: CheckoutForm, cart: CartLine[]) {
  const total = cartTotal(cart);
  const when = f.type === 'Delivery' ? 'na entrega' : 'na retirada';
  const lines = [
    `*Pedido ${code}* — Catálogo digital`,
    `Cliente: ${f.customer.trim()}`,
    `WhatsApp: ${f.phone.trim()}`,
    '',
    ...cart.map((l) => `${l.qty}x ${l.name} — ${money(l.price * l.qty)}${l.note ? `\n   Obs.: ${l.note}` : ''}`),
    '',
    f.type === 'Delivery' ? 'Entrega' : 'Retirada no local',
  ];
  if (f.type === 'Delivery') {
    const a = f.address;
    lines.push(`Endereço: ${a.street.trim()}, ${a.number.trim()}${a.complement.trim() ? ` — ${a.complement.trim()}` : ''}`, `Bairro: ${a.neighborhood.trim()} — Eunápolis`);
    if (a.reference.trim()) lines.push(`Referência: ${a.reference.trim()}`);
  }
  if (f.requestedTime.trim()) lines.push(`Horário solicitado: ${f.requestedTime.trim()}`);
  if (f.note.trim()) lines.push(`Observação: ${f.note.trim()}`);
  lines.push('', `Subtotal: ${money(total)}`, `Taxa de entrega: ${money(0)}`, `Desconto: ${money(0)}`, `*Total: ${money(total)}*`, '',
    `Pagamento: ${f.payment} — ${when}`, 'Situação do pagamento: pendente');
  if (f.payment === 'Dinheiro') lines.push(f.needChange ? `Troco para ${money(Number(f.cashFor.replace(',', '.')))}` : 'Sem troco');
  if ((f.payment === 'Crédito' || f.payment === 'Débito') && f.type === 'Delivery') lines.push('Levar maquininha');
  return lines.join('\n');
}

export const whatsappLink = (text: string) => `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(text)}`;
