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
