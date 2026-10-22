import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Search, Star, Sparkles, Trash2, ChefHat, MessageSquare } from "lucide-react";
import {
  addToDraft, brl, commitDraft, setItem, setState, totals, updateDraft, useStore, emptyDraft, type OrderType, type Product,
} from "@/lib/pdv-store";
import { Checkout } from "./Checkout";
import { EditProduct } from "./EditProduct";
import { TableSelector } from './TableSelector';
import { validTable, tableLabel } from '@/lib/pdv-tables';

const TYPES: OrderType[] = ["Balcão", "Mesa", "Retirada", "Delivery"];

export function SellView({ admin = false }: { admin?: boolean }) {
  const products = useStore((s) => s.products);
  const settings = useStore((s) => s.settings);
  const draft = useStore((s) => s.draft);
  const cashOpen = useStore((s) => s.cash.open);
  const [cat, setCat] = useState("Todos");
  const [q, setQ] = useState("");
  const [pay, setPay] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const t = totals(draft, settings.serviceFeePct);

  const list = useMemo(() => products.filter((p) => p.active)
    .filter((p) => cat === "Todos" || (cat === "Favoritos" ? p.favorite : p.category === cat))
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())), [products, cat, q]);

  // Venda sugestiva: sugere itens complementares ainda não no carrinho
  const suggestions = useMemo(() => {
    const inCart = new Set(draft.items.map((i) => i.productId));
    const ids = new Set<string>();
    draft.items.forEach((i) => products.find((p) => p.id === i.productId)?.upsell?.forEach((u) => !inCart.has(u) && ids.add(u)));
    return [...ids].map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p && p.active && p.stock !== 0).slice(0, 3);
  }, [draft.items, products]);

  const add = (p: Product) => {
    if (p.price <= 0) { toast.error(`Defina o preço de "${p.name}" antes de vender.`); setEditing(p); return; }
    const inCart = draft.items.filter((i) => i.productId === p.id).reduce((a, i) => a + i.qty, 0);
    if (p.stock !== null && inCart >= p.stock) { toast.error(`Sem estoque de "${p.name}".`); return; }
    addToDraft(p);
  };

  const sendKitchen = () => {
    if (!draft.items.length) return;
    const o = commitDraft("cozinha");
    if (o) toast.success(`Comanda #${o.number} enviada para a cozinha`);
  };
  const charge = () => {
    if (!draft.items.length) return;
    if(draft.type==='Mesa'&&!validTable(draft.tableNumber)){toast.error('Escolha uma das cinco mesas.');return;}
    if (!cashOpen) { toast.error("Abra o caixa antes de cobrar (aba Caixa)."); return; }
    setPay(true);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F4") { e.preventDefault(); charge(); }
      if (e.key === "F8") { e.preventDefault(); sendKitchen(); }
      if (e.key === "Enter" && document.activeElement === searchRef.current && list[0]) { add(list[0]); setQ(""); }
      if (e.key === "Escape" && document.activeElement === searchRef.current) setQ("");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const maxDiscount = (t.sub * settings.maxDiscountPct) / 100;

  return (
    <div className="grid gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Catálogo */}
      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto…" className="field pl-9" />
            <span className="kbd absolute right-3 top-1/2 -translate-y-1/2">F2</span>
          </div>
          {admin && <button className="btn btn-ghost" onClick={() => setEditing({ id: "", name: "", category: settings.categories[0] ?? "", price: 0, cost: 0, stock: null, minStock: 5, favorite: false, active: true })}>
            <Plus size={16} /> Produto
          </button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["Todos", "Favoritos", ...settings.categories].map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${cat === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {c === "Favoritos" ? "★ Favoritos" : c}
            </button>
          ))}
        </div>
        <div className="grid max-h-[45dvh] min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:max-h-none xl:grid-cols-4">
          {list.map((p) => {
            const low = p.stock !== null && p.stock <= p.minStock;
            const out = p.stock === 0;
            const qty = draft.items.filter((i) => i.productId === p.id).reduce((a, i) => a + i.qty, 0);
            return (
              <div key={p.id} className={`group relative flex flex-col rounded-lg border bg-card transition hover:border-primary ${settings.compactCatalog ? 'p-2' : 'p-4'} ${out ? "opacity-40" : ""} ${qty ? "border-primary/70" : ""}`}>
                <button onClick={() => add(p)} disabled={out} className="flex flex-1 flex-col items-start text-left">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.category}</span>
                  <span className="mt-0.5 font-semibold leading-tight">{p.name}</span>
                  <span className={`mt-2 font-mono text-lg font-bold ${p.price ? "text-primary" : "text-warning"}`}>{p.price ? brl(p.price) : "Definir preço"}</span>
                </button>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className={out ? "text-destructive" : low ? "text-warning" : "text-muted-foreground"}>
                    {p.stock === null ? "Sem controle" : out ? "Esgotado" : `${p.stock} em estoque`}
                  </span>
                  {admin && <span className="flex gap-2 opacity-60 group-hover:opacity-100">
                    <button onClick={() => setState((s) => ({ ...s, products: s.products.map((x) => x.id === p.id ? { ...x, favorite: !x.favorite } : x) }))}>
                      <Star size={13} className={p.favorite ? "fill-accent text-accent" : ""} />
                    </button>
                    <button onClick={() => setEditing(p)} className="underline-offset-2 hover:underline">Editar</button>
                  </span>}
                </div>
                {qty > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-ember-gradient px-1 text-xs font-bold text-primary-foreground">{qty}</span>}
              </div>
            );
          })}
          {!list.length && <p className="col-span-full py-10 text-center text-muted-foreground">Nenhum produto encontrado.</p>}
        </div>
      </section>

      {/* Pedido */}
      <aside className="flex min-h-0 flex-col rounded-2xl border bg-card">
        <div className="border-b p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold">{draft.editingId ? "Editando comanda" : draft.type==='Mesa'&&validTable(draft.tableNumber)?tableLabel(draft):"Novo pedido"}</h2>
            <span className="text-xs text-muted-foreground">{draft.items.reduce((a, i) => a + i.qty, 0)} itens</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg bg-background p-1">
            {TYPES.map((tp) => (
              <button key={tp} onClick={() => updateDraft({ type: tp })}
                className={`rounded-md py-1.5 text-xs font-semibold ${draft.type === tp ? "bg-elevated text-foreground" : "text-muted-foreground"}`}>{tp}</button>
            ))}
          </div>
          {draft.type==='Mesa'&&<TableSelector value={draft.tableNumber} onChange={tableNumber=>updateDraft({tableNumber})}/>}
          <input className="field mt-2" placeholder={draft.type === "Delivery" ? "Nome, telefone e endereço" : "Nome do cliente (opcional)"}
            value={draft.customer} onChange={(e) => updateDraft({ customer: e.target.value })} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!draft.items.length ? (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
              <div><p className="font-semibold text-foreground">Pronto para o próximo pedido.</p><p>Toque nos produtos ao lado.</p></div>
            </div>
          ) : draft.items.map((i) => (
            <div key={i.uid} className="pdv-item-enter rounded-lg px-2 py-2 hover:bg-elevated">
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-md border">
                  <button className="p-1.5" onClick={() => setItem(i.uid, { qty: i.qty - 1 })}><Minus size={12} /></button>
                  <span className="w-6 text-center font-mono text-sm">{i.qty}</span>
                  <button className="p-1.5" onClick={() => { const p = products.find((x) => x.id === i.productId); if (p) add(p); }}><Plus size={12} /></button>
                </div>
                <span className="min-w-0 flex-1 text-sm font-medium">{i.name}</span>
                <span className="font-mono text-sm">{brl(i.price * i.qty)}</span>
                <button onClick={() => setNoteFor(noteFor === i.uid ? null : i.uid)} className={i.note ? "text-accent" : "text-muted-foreground"}><MessageSquare size={14} /></button>
                <button onClick={() => setItem(i.uid, { qty: 0 })} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
              </div>
              {(noteFor === i.uid || i.note) && (
                <input className="field mt-1.5 py-1 text-xs" placeholder="Ex.: sem cebola, ao ponto…" value={i.note}
                  onChange={(e) => setItem(i.uid, { note: e.target.value })} />
              )}
            </div>
          ))}

          {settings.upsellEnabled !== false && suggestions.length > 0 && (
            <div className="m-2 rounded-xl border border-dashed border-primary/50 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles size={13} /> Ofereça ao cliente</div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button key={s.id} onClick={() => add(s)} className="rounded-full bg-secondary px-2.5 py-1 text-xs hover:bg-elevated">+ {s.name} · {brl(s.price)}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 border-t p-4">
          <textarea className="field h-14 resize-none text-xs" placeholder="Observações gerais" value={draft.note} onChange={(e) => updateDraft({ note: e.target.value })} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Desconto</span>
            {[0, 5, 10].filter((d) => d <= settings.maxDiscountPct).map((d) => (
              <button key={d} className="rounded bg-secondary px-2 py-1" onClick={() => updateDraft({ discount: Math.round(t.sub * d) / 100 })}>{d}%</button>
            ))}
            <input className="field w-24 py-1 text-xs" inputMode="decimal" value={draft.discount || ""} placeholder="R$"
              onChange={(e) => {
                const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                if (v > maxDiscount) toast.warning(`Desconto máximo: ${settings.maxDiscountPct}% (${brl(maxDiscount)})`);
                updateDraft({ discount: Math.max(0, Math.min(v, maxDiscount)) });
              }} />
            <label className="ml-auto flex items-center gap-1"><input type="checkbox" checked={draft.serviceFee} onChange={(e) => updateDraft({ serviceFee: e.target.checked })} />{settings.serviceFeePct}% serviço</label>
          </div>
          <dl className="space-y-1 text-sm">
            <Row k="Subtotal" v={brl(t.sub)} />
            {draft.discount > 0 && <Row k="Desconto" v={`− ${brl(draft.discount)}`} />}
            {t.service > 0 && <Row k="Serviço" v={brl(t.service)} />}
            {draft.fee > 0 && <Row k="Entrega" v={brl(draft.fee)} />}
          </dl>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-display text-3xl font-bold">{brl(t.total)}</span>
          </div>
          <button className="btn btn-primary w-full py-3 text-base" disabled={!draft.items.length} onClick={charge}>Cobrar pedido <span className="kbd">F4</span></button>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost" disabled={!draft.items.length} onClick={sendKitchen}><ChefHat size={15} /> Cozinha <span className="kbd">F8</span></button>
            <button className="btn btn-ghost" disabled={!draft.items.length && !draft.editingId} onClick={() => setState((s) => ({ ...s, draft: emptyDraft() }))}>Limpar</button>
          </div>
        </div>
      </aside>

      <Checkout open={pay} onClose={() => setPay(false)} total={t.total} methods={settings.paymentMethods} title="Cobrar pedido"
        onConfirm={(p) => { const o = commitDraft("pago", p); setPay(false); if (o) toast.success(`Pedido #${o.number} pago — ${brl(t.total)}`); }} />
      <EditProduct product={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between text-muted-foreground"><dt>{k}</dt><dd className="font-mono text-foreground">{v}</dd></div>
);
