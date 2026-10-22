import { useSyncExternalStore } from "react";
import { toast } from "sonner";

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number | null; // null = sem controle
  minStock: number;
  favorite: boolean;
  active: boolean;
  upsell?: string[]; // ids sugeridos
};
export type CartItem = { uid: string; productId: string; name: string; price: number; qty: number; note: string };
export type OrderType = "Balcão" | "Mesa" | "Retirada" | "Delivery";
export type Payment = { method: string; amount: number };
export type OrderStatus = "aberta" | "cozinha" | "pronto" | "pago" | "cancelado";
export type Order = {
  id: string;
  number: number;
  type: OrderType;
  customer: string;
  items: CartItem[];
  note: string;
  discount: number; // valor
  fee: number; // taxa/entrega
  serviceFee: boolean;
  payments: Payment[];
  status: OrderStatus;
  createdAt: number;
  paidAt?: number | undefined;
  sellerId?: string;
  sellerName?: string;
  serviceAmount?: number;
};
export type CashMove = { id: string; kind: "sangria" | "suprimento"; amount: number; reason: string; at: number };
export type Settings = {
  storeName: string;
  categories: string[];
  paymentMethods: string[];
  serviceFeePct: number;
  deliveryFee: number;
  dailyGoal: number;
  maxDiscountPct: number;
};
export type State = {
  products: Product[];
  orders: Order[];
  draft: { type: OrderType; customer: string; items: CartItem[]; note: string; discount: number; fee: number; serviceFee: boolean; editingId?: string | undefined };
  cash: { open: boolean; openedAt?: number; initial: number; moves: CashMove[] };
  settings: Settings;
  nextNumber: number;
};

export const uid = () => Math.random().toString(36).slice(2, 10);
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const p = (name: string, category: string, price: number, stock: number | null = null, cost = 0, minStock = 5): Product => ({
  id: `product-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, category, price, cost: cost || Math.round(price * 0.4 * 100) / 100, stock, minStock, favorite: false, active: true,
});

function seed(): State {
  const products = [
    p("Espeto de carne", "Espetinhos", 8), p("Espeto de frango", "Espetinhos", 8), p("Espeto misto", "Espetinhos", 8),
    p("Espeto de coração", "Espetinhos", 8), p("Espeto de calabresa", "Espetinhos", 8), p("Queijo coalho", "Espetinhos", 9),
    p("Pão de alho", "Espetinhos", 5), p("Ultrasalada", "Hambúrgueres", 26.97), p("Hambúrguer", "Hambúrgueres", 22, 60),
    p("Feijão tropeiro", "Acompanhamentos", 6), p("Farofa de manteiga", "Acompanhamentos", 6), p("Arroz", "Acompanhamentos", 6),
    p("Vinagrete", "Acompanhamentos", 6), p("Aipim na manteiga", "Acompanhamentos", 6), p("Purê de aipim", "Acompanhamentos", 6),
    p("Suco de manga", "Bebidas", 8), p("Suco de goiaba", "Bebidas", 8), p("Suco de cajá", "Bebidas", 8), p("Suco de maracujá", "Bebidas", 8),
    p("Coxinha", "Salgados", 6, 15), p("Enroladinho", "Salgados", 6, 15), p("Bolinho de queijo", "Salgados", 6, 15), p("Empada", "Salgados", 6, 12),
    p("Sanduíche natural", "Lanches", 7, 9), p("Marmita completa", "Marmitas", 22), p("Água", "Bebidas", 3, 11),
    p("Coca-Cola 1 L", "Bebidas", 12, 6), p("Coca-Cola 350 ml", "Bebidas", 6, 24), p("Pepsi 1 L", "Bebidas", 12, 3),
    p("Guaraná 350 ml", "Bebidas", 6, 9), p("H2O limão 500 ml", "Bebidas", 7, 4),
  ];
  const byName = (n: string) => products.find((x) => x.name === n)?.id ?? '';
  ["Espeto de carne", "Espeto misto", "Coca-Cola 350 ml", "Hambúrguer", "Feijão tropeiro"].forEach((n) => { const product = products.find((x) => x.name === n); if (product) product.favorite = true; });
  // Upsell: espetos → acompanhamentos + bebida; hambúrguer → bebida
  products.filter((x) => x.category === "Espetinhos").forEach((x) => (x.upsell = [byName("Farofa de manteiga"), byName("Vinagrete"), byName("Coca-Cola 350 ml")]));
  products.filter((x) => x.category === "Hambúrgueres").forEach((x) => (x.upsell = [byName("Coca-Cola 350 ml"), byName("Suco de maracujá"), byName("Aipim na manteiga")]));
  products.filter((x) => x.category === "Salgados").forEach((x) => (x.upsell = [byName("Guaraná 350 ml"), byName("Suco de cajá")]));
  return {
    products,
    orders: [],
    draft: emptyDraft(),
    cash: { open: false, initial: 0, moves: [] },
    settings: {
      storeName: "Ultra Brasa",
      categories: ["Espetinhos", "Hambúrgueres", "Salgados", "Lanches", "Marmitas", "Acompanhamentos", "Bebidas"],
      paymentMethods: ["Pix", "Dinheiro", "Crédito", "Débito", "Vale-refeição"],
      serviceFeePct: 10,
      deliveryFee: 5,
      dailyGoal: 1500,
      maxDiscountPct: 15,
    },
    nextNumber: 1,
  };
}
export function emptyDraft(): State["draft"] {
  return { type: "Balcão", customer: "", items: [], note: "", discount: 0, fee: 0, serviceFee: false };
}

const KEY = "ultrabrasa-pdv-v2";
let state: State = seed();
let hydrated = false;
const listeners = new Set<() => void>();
let persistence: ((s: State) => Promise<void>) | null = null;
let saving = false;
export const isSaving = () => saving;
export function configurePersistence(save: typeof persistence) { persistence = save; }
export function replaceState(next: State) { state = next; listeners.forEach(l => l()); }
export function useSaving() { return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => saving, () => false); }

export function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...seed(), ...JSON.parse(raw) };
  } catch {}
  listeners.forEach((l) => l());
}
export function setState(fn: (s: State) => State) {
  if (saving) { toast.warning('Aguarde o salvamento anterior.'); return; }
  const previous = state;
  state = fn(state);
  const sharedChanged = JSON.stringify({ ...previous, draft: undefined }) !== JSON.stringify({ ...state, draft: undefined });
  if (persistence && sharedChanged) {
    saving = true;
    void persistence(state).then(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} })
      .catch((e: unknown) => { state = previous; toast.error(e instanceof Error ? e.message : 'Não foi salvo. Recarregue e tente novamente.'); })
      .finally(() => { saving = false; listeners.forEach(l => l()); });
  } else if (!persistence) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
  listeners.forEach((l) => l());
}
export function resetAll() { setState(() => seed()); }
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => sel(state),
    () => sel(state),
  );
}
export const getState = () => state;

// ---- cálculos (puros, testáveis)
export const subtotal = (items: CartItem[]) => items.reduce((a, i) => a + i.price * i.qty, 0);
export function totals(o: { items: CartItem[]; discount: number; fee: number; serviceFee: boolean }, serviceFeePct: number) {
  const sub = subtotal(o.items);
  const service = o.serviceFee ? Math.round(sub * serviceFeePct) / 100 : 0;
  const total = Math.max(0, sub - o.discount + o.fee + service);
  return { sub, service, total };
}
export const paid = (o: Order) => o.payments.reduce((a, p) => a + p.amount, 0);

// ---- ações do rascunho
export function addToDraft(prod: Product) {
  setState((s) => {
    const items = [...s.draft.items];
    const ex = items.find((i) => i.productId === prod.id && !i.note);
    if (ex) ex.qty += 1;
    else items.push({ uid: uid(), productId: prod.id, name: prod.name, price: prod.price, qty: 1, note: "" });
    return { ...s, draft: { ...s.draft, items: items.map((i) => ({ ...i })) } };
  });
}
export function updateDraft(patch: Partial<State["draft"]>) {
  setState((s) => {
    const d = { ...s.draft, ...patch };
    if (patch.type) {
      d.fee = patch.type === "Delivery" ? s.settings.deliveryFee : 0;
      d.serviceFee = patch.type === "Mesa";
    }
    return { ...s, draft: d };
  });
}
export function setItem(uidv: string, patch: Partial<CartItem>) {
  setState((s) => ({
    ...s,
    draft: { ...s.draft, items: s.draft.items.map((i) => (i.uid === uidv ? { ...i, ...patch } : i)).filter((i) => i.qty > 0) },
  }));
}

function applyStock(s: State, items: CartItem[], dir: -1 | 1): Product[] {
  return s.products.map((pr) => {
    if (pr.stock === null) return pr;
    const q = items.filter((i) => i.productId === pr.id).reduce((a, i) => a + i.qty, 0);
    return q ? { ...pr, stock: Math.max(0, pr.stock + dir * q) } : pr;
  });
}

/** Salva o rascunho como pedido. status: "cozinha" (comanda aberta) ou "pago". Retorna o pedido. */
export function commitDraft(status: "cozinha" | "pago", payments: Payment[] = []): Order | null {
  let created: Order | null = null;
  setState((s) => {
    if (!s.draft.items.length) return s;
    const { editingId, ...d } = s.draft;
    if (editingId) {
      const prev = s.orders.find((o) => o.id === editingId);
      if (prev) {
        let products = applyStock(s, prev.items, 1);
        products = applyStock({ ...s, products }, d.items, -1);
        const upd: Order = { ...prev, ...d, serviceAmount: totals(d, s.settings.serviceFeePct).service, status, payments: status === "pago" ? payments : prev.payments, paidAt: status === "pago" ? Date.now() : undefined };
        created = upd;
        return { ...s, products, orders: s.orders.map((o) => (o.id === editingId ? upd : o)), draft: emptyDraft() };
      }
    }
    const order: Order = { id: uid(), number: s.nextNumber, ...d, serviceAmount: totals(d, s.settings.serviceFeePct).service, payments, status, createdAt: Date.now(), paidAt: status === "pago" ? Date.now() : undefined };
    created = order;
    return { ...s, products: applyStock(s, d.items, -1), orders: [order, ...s.orders], draft: emptyDraft(), nextNumber: s.nextNumber + 1 };
  });
  return created;
}
export function loadOrderToDraft(o: Order) {
  setState((s) => ({ ...s, draft: { type: o.type, customer: o.customer, items: o.items.map((i) => ({ ...i })), note: o.note, discount: o.discount, fee: o.fee, serviceFee: o.serviceFee, editingId: o.id } }));
}
export function setOrderStatus(id: string, status: OrderStatus, payments?: Payment[]) {
  setState((s) => {
    const o = s.orders.find((x) => x.id === id);
    if (!o) return s;
    let products = s.products;
    if (status === "cancelado" && o.status !== "cancelado") products = applyStock(s, o.items, 1);
    return {
      ...s,
      products,
      orders: s.orders.map((x) => (x.id === id ? { ...x, status, payments: payments ?? x.payments, paidAt: status === "pago" ? Date.now() : x.paidAt } : x)),
    };
  });
}

export const isToday = (t: number) => new Date(t).toDateString() === new Date().toDateString();
