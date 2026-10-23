import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, Pencil, Plus, Printer, Star } from "lucide-react";
import {
  brl, isToday, loadOrderToDraft, paid, setOrderStatus, setState, totals, uid, useStore, type Order, type Product,
} from "@/lib/pdv-store";
import { Checkout } from "./Checkout";
import { EditProduct } from "./EditProduct";
import { SalesHistory } from "./SalesHistory";
import { kitchenTone } from "@/lib/pdv-settings";
import { tableLabel } from '@/lib/pdv-tables';
import { Button } from '@/components/ui/button';
import { printOrder } from '@/services/thermalPrinter';

const mins = (t: number) => Math.floor((Date.now() - t) / 60000);
function useTick() { const [, s] = useState(0); useEffect(() => { const i = setInterval(() => s((x) => x + 1), 15000); return () => clearInterval(i); }, []); }
function printManual(o: Order, pct: number, target: 'kitchen' | 'cashier' = 'cashier') {
  toast.info(`Imprimindo pedido #${o.number}...`);
  printOrder(o, pct, { manual: true, target }).then(() => toast.success(`Pedido #${o.number} impresso`)).catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Falha ao imprimir'));
}

/* ---------------- COMANDAS ---------------- */
export function OrdersView({ goSell, admin = false }: { goSell: () => void; admin?: boolean }) {
  useTick();
  const orders = useStore((s) => s.orders);
  const settings = useStore((s) => s.settings);
  const cashOpen = useStore((s) => s.cash.open);
  const [paying, setPaying] = useState<Order | null>(null);
  const open = orders.filter((o) => ["aberta", "cozinha", "pronto"].includes(o.status));

  return (
    <div className="space-y-6">
      <Header title="Comandas abertas" sub={`${open.length} em andamento`} />
      {!open.length && <Empty text="Nenhuma comanda aberta. Use “Cozinha (F8)” no PDV para abrir uma." />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {open.map((o) => {
          const t = totals(o, settings.serviceFeePct).total;
          return (
            <div key={o.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between">
                <div><div className="font-display text-2xl font-bold">#{o.number}</div><div className="text-sm font-semibold text-primary">{tableLabel(o)}</div>{o.customer&&<div className="text-xs text-muted-foreground">{o.customer}</div>}</div>
                <StatusPill s={o.status} />
              </div>
              <ul className="my-3 space-y-0.5 text-sm">{o.items.map((i) => <li key={i.uid} className="flex justify-between"><span>{i.qty}× {i.name}</span><span className="font-mono text-muted-foreground">{brl(i.qty * i.price)}</span></li>)}</ul>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={12} />{mins(o.createdAt)} min</span>
                <span className="font-display text-xl font-bold">{brl(t)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn btn-ghost text-xs" onClick={() => { loadOrderToDraft(o); goSell(); }}><Pencil size={13} />Editar</button>
                <button className="btn btn-ghost text-xs" onClick={() => printManual(o, settings.serviceFeePct)}><Printer size={13} />Imprimir</button>
                {admin && <button className="btn btn-ghost text-xs text-destructive" onClick={() => confirm(`Cancelar comanda #${o.number}? O estoque será devolvido.`) && setOrderStatus(o.id, "cancelado")}>Cancelar</button>}
                <button className="btn btn-primary text-xs" onClick={() => cashOpen ? setPaying(o) : toast.error("Abra o caixa primeiro.")}>Cobrar</button>
              </div>
            </div>
          );
        })}
      </div>

      <SalesHistory />

      <Checkout open={!!paying} onClose={() => setPaying(null)} methods={settings.paymentMethods}
        total={paying ? totals(paying, settings.serviceFeePct).total : 0} title={`Cobrar comanda #${paying?.number ?? ""}`}
        onConfirm={(p) => { if (paying) { setOrderStatus(paying.id, "pago", p); toast.success(`Comanda #${paying.number} paga`); } setPaying(null); }} />
    </div>
  );
}

/* ---------------- COZINHA (KDS) ---------------- */
export function KitchenView() {
  useTick();
  const settings = useStore(s => s.settings);
  const orders = useStore((s) => s.orders).filter((o) => o.status === "cozinha" || o.status === "pronto");
  return (
    <div className="space-y-4">
      <Header title="Cozinha · Preparação" sub={`${orders.filter(o=>o.status==='cozinha').length} preparando · ${orders.filter(o=>o.status==='pronto').length} prontos · ${new Date().toLocaleDateString("pt-BR")}`} />
      {!orders.length && <Empty text="Cozinha livre 🔥" />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[...orders].reverse().map((o) => {
          const m = mins(o.createdAt);
          const tone = o.status === "pronto" ? "border-success" : kitchenTone(m, settings);
          return (
            <div key={o.id} className={`kitchen-ticket pdv-item-enter rounded-lg border-2 bg-card p-4 ${tone}`}>
              <div className="flex justify-between"><span className="font-display text-3xl font-bold">#{o.number}</span><span className="font-mono text-lg">{m}′</span></div>
              <div className="mt-2 text-2xl font-bold text-primary">{tableLabel(o)}</div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{o.customer}</span><span>{o.status==='cozinha'?'Em preparação':'Pronto para servir'}</span></div>
              {o.sellerName&&<div className="mt-2 text-xs text-muted-foreground">Atendente · {o.sellerName}</div>}
              <ul className="my-3 space-y-1.5">{o.items.map((i) => <li key={i.uid}><b className="text-primary">{i.qty}×</b> {i.name}{i.note && <div className="ml-6 text-xs text-accent">↳ {i.note}</div>}</li>)}</ul>
              {o.note && <p className="mb-3 rounded bg-elevated p-2 text-xs">{o.note}</p>}
              <Button variant="outline" className="mb-2 w-full" onClick={() => printManual(o, settings.serviceFeePct, 'kitchen')}><Printer size={14} />Imprimir</Button>
              {o.status === "cozinha"
                ? <Button className="w-full" onClick={() => setOrderStatus(o.id, "pronto")}>Marcar pronto</Button>
                : <Button variant="outline" className="w-full text-success" onClick={() => setOrderStatus(o.id, "aberta")}>Servido à mesa ✓</Button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- PRODUTOS ---------------- */
export function ProductsView() {
  const products = useStore((s) => s.products);
  const cats = useStore((s) => s.settings.categories);
  const [edit, setEdit] = useState<Product | null>(null);
  const [q, setQ] = useState("");
  const upd = (id: string, patch: Partial<Product>) => setState((s) => ({ ...s, products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const list = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const pending = products.filter((p) => !p.price || (p.stock !== null && p.stock <= p.minStock));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Header title="Produtos" sub="Edite direto na tabela. Alterações salvam na hora." />
        <div className="flex gap-2"><input className="field w-56" placeholder="Filtrar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-primary" onClick={() => setEdit({ id: "", name: "", category: cats[0] ?? "", price: 0, cost: 0, stock: null, minStock: 5, favorite: false, active: true })}><Plus size={15} />Novo</button></div>
      </div>
      {pending.length > 0 && <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">⚠ {pending.length} produto(s) precisam de atenção: {pending.map((p) => p.name).join(", ")}</div>}
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-elevated text-left text-xs text-muted-foreground"><tr><th className="p-3"></th><th>Nome</th><th>Categoria</th><th>Preço</th><th>Custo</th><th>Margem</th><th>Estoque</th><th>Ativo</th><th></th></tr></thead>
          <tbody>{list.map((p) => {
            const m = p.price ? ((p.price - p.cost) / p.price) * 100 : 0;
            return (
              <tr key={p.id} className="border-t">
                <td className="p-3"><button onClick={() => upd(p.id, { favorite: !p.favorite })}><Star size={14} className={p.favorite ? "fill-accent text-accent" : "text-muted-foreground"} /></button></td>
                <td><input className="field border-transparent bg-transparent py-1" value={p.name} onChange={(e) => upd(p.id, { name: e.target.value })} /></td>
                <td><select className="field border-transparent bg-transparent py-1" value={p.category} onChange={(e) => upd(p.id, { category: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select></td>
                <td><NumCell v={p.price} on={(v) => upd(p.id, { price: v })} warn={!p.price} /></td>
                <td><NumCell v={p.cost} on={(v) => upd(p.id, { cost: v })} /></td>
                <td className={`font-mono text-xs ${m < 30 ? "text-warning" : "text-success"}`}>{m.toFixed(0)}%</td>
                <td>{p.stock === null ? <button className="text-xs text-muted-foreground underline" onClick={() => upd(p.id, { stock: 0 })}>controlar</button>
                  : <input type="number" className={`field w-20 py-1 font-mono ${p.stock <= p.minStock ? "text-warning" : ""}`} value={p.stock} onChange={(e) => upd(p.id, { stock: Math.max(0, parseInt(e.target.value) || 0) })} />}</td>
                <td><input type="checkbox" checked={p.active} onChange={(e) => upd(p.id, { active: e.target.checked })} /></td>
                <td className="pr-3"><button className="text-muted-foreground hover:text-foreground" onClick={() => setEdit(p)}><Pencil size={14} /></button></td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      <EditProduct product={edit} onClose={() => setEdit(null)} />
    </div>
  );
}
function NumCell({ v, on, warn }: { v: number; on: (n: number) => void; warn?: boolean }) {
  const [s, setS] = useState(v ? v.toFixed(2) : "");
  useEffect(() => setS(v ? v.toFixed(2) : ""), [v]);
  return <input className={`field w-24 py-1 font-mono ${warn ? "border-warning" : ""}`} inputMode="decimal" value={s} placeholder="0,00"
    onChange={(e) => setS(e.target.value)} onBlur={() => on(parseFloat(s.replace(",", ".")) || 0)} />;
}

/* ---------------- CAIXA ---------------- */
export function CashView() {
  const cash = useStore((s) => s.cash);
  const orders = useStore((s) => s.orders);
  const products = useStore((s) => s.products);
  const settings = useStore((s) => s.settings);
  const [initial, setInitial] = useState("");
  const [mv, setMv] = useState({ kind: "sangria" as "sangria" | "suprimento", amount: "", reason: "" });
  const [counted, setCounted] = useState("");

  const since = cash.openedAt ?? new Date().setHours(0, 0, 0, 0);
  const paidOrders = orders.filter((o) => o.status === "pago" && (o.paidAt ?? 0) >= since);
  const byMethod = useMemo(() => {
    const m: Record<string, number> = {};
    paidOrders.forEach((o) => o.payments.forEach((p) => (m[p.method] = (m[p.method] ?? 0) + p.amount)));
    return m;
  }, [paidOrders]);
  const revenue = Object.values(byMethod).reduce((a, b) => a + b, 0);
  const ticket = paidOrders.length ? revenue / paidOrders.length : 0;
  const cmv = paidOrders.reduce((a, o) => a + o.items.reduce((x, i) => x + (products.find((p) => p.id === i.productId)?.cost ?? 0) * i.qty, 0), 0);
  const moves = cash.moves.reduce((a, m) => a + (m.kind === "sangria" ? -m.amount : m.amount), 0);
  const expectedCash = cash.initial + (byMethod["Dinheiro"] ?? 0) + moves;
  const top = useMemo(() => {
    const m: Record<string, number> = {};
    paidOrders.forEach((o) => o.items.forEach((i) => (m[i.name] = (m[i.name] ?? 0) + i.qty)));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [paidOrders]);
  const goalPct = Math.min(100, (revenue / (settings.dailyGoal || 1)) * 100);
  const n = (s: string) => parseFloat(s.replace(",", ".")) || 0;

  if (!cash.open) return (
    <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
      <h2 className="text-3xl font-bold">Abrir caixa</h2>
      <p className="text-muted-foreground">Informe o valor em dinheiro na gaveta para começar o turno.</p>
      <input className="field text-center font-mono text-2xl" inputMode="decimal" placeholder="R$ 0,00" value={initial} onChange={(e) => setInitial(e.target.value)} />
      <button className="btn btn-primary w-full py-3" onClick={() => { setState((s) => ({ ...s, cash: { open: true, openedAt: Date.now(), initial: n(initial), moves: [] } })); toast.success("Caixa aberto. Boas vendas!"); }}>Abrir caixa</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <Header title="Caixa do turno" sub={`Aberto em ${new Date(cash.openedAt ?? since).toLocaleString("pt-BR")}`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi k="Faturamento" v={brl(revenue)} />
        <Kpi k="Pedidos · ticket médio" v={`${paidOrders.length} · ${brl(ticket)}`} />
        <Kpi k="Lucro bruto estimado" v={brl(revenue - cmv)} sub={revenue ? `${(((revenue - cmv) / revenue) * 100).toFixed(0)}% de margem` : ""} />
        <Kpi k="Dinheiro esperado na gaveta" v={brl(expectedCash)} />
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-2 flex justify-between text-sm"><span>Meta do dia</span><span className="font-mono">{brl(revenue)} / {brl(settings.dailyGoal)}</span></div>
        <div className="h-3 overflow-hidden rounded-full bg-background"><div className="h-full bg-ember-gradient transition-all" style={{ width: `${goalPct}%` }} /></div>
        <p className="mt-2 text-xs text-muted-foreground">{goalPct >= 100 ? "Meta batida! 🔥" : `Faltam ${brl(settings.dailyGoal - revenue)} — ofereça acompanhamentos e bebidas para subir o ticket.`}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Box t="Por forma de pagamento">{settings.paymentMethods.map((m) => <Line key={m} k={m} v={brl(byMethod[m] ?? 0)} />)}</Box>
        <Box t="Mais vendidos">{top.length ? top.map(([k, v]) => <Line key={k} k={k} v={`${v} un`} />) : <p className="text-sm text-muted-foreground">Sem vendas ainda.</p>}</Box>
        <Box t="Sangria / suprimento">
          <div className="flex gap-1">{(["sangria", "suprimento"] as const).map((k) => <button key={k} onClick={() => setMv({ ...mv, kind: k })} className={`btn flex-1 text-xs ${mv.kind === k ? "btn-primary" : "btn-ghost"}`}>{k}</button>)}</div>
          <input className="field font-mono" placeholder="Valor" inputMode="decimal" value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} />
          <input className="field" placeholder="Motivo" value={mv.reason} onChange={(e) => setMv({ ...mv, reason: e.target.value })} />
          <button className="btn btn-ghost w-full" onClick={() => { if (!n(mv.amount)) return; setState((s) => ({ ...s, cash: { ...s.cash, moves: [...s.cash.moves, { id: uid(), kind: mv.kind, amount: n(mv.amount), reason: mv.reason, at: Date.now() }] } })); setMv({ ...mv, amount: "", reason: "" }); }}>Registrar</button>
          {cash.moves.map((m) => <Line key={m.id} k={`${m.kind} · ${m.reason || "—"}`} v={`${m.kind === "sangria" ? "−" : "+"}${brl(m.amount)}`} />)}
        </Box>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="mb-2 font-bold">Fechar caixa</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input className="field w-48 font-mono" placeholder="Dinheiro contado" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} />
          {counted && <span className={`font-mono text-sm ${Math.abs(n(counted) - expectedCash) < 0.01 ? "text-success" : "text-warning"}`}>Diferença: {brl(n(counted) - expectedCash)}</span>}
          <button className="btn btn-ghost ml-auto" onClick={() => {
            const open = orders.filter((o) => ["aberta", "cozinha", "pronto"].includes(o.status)).length;
            if (open && !confirm(`Há ${open} comanda(s) aberta(s). Fechar mesmo assim?`)) return;
            setState((s) => ({ ...s, cash: { open: false, initial: 0, moves: [] } })); setCounted(""); toast.success(`Caixa fechado · ${brl(revenue)}`);
          }}>Fechar caixa</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */
const Header = ({ title, sub }: { title: string; sub?: string }) => <div><h2 className="text-2xl font-bold">{title}</h2>{sub && <p className="text-sm text-muted-foreground">{sub}</p>}</div>;
const Empty = ({ text }: { text: string }) => <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">{text}</div>;
const Kpi = ({ k, v, sub }: { k: string; v: string; sub?: string }) => <div className="rounded-2xl border bg-card p-4"><div className="text-xs text-muted-foreground">{k}</div><div className="mt-1 font-display text-2xl font-bold">{v}</div>{sub && <div className="text-xs text-success">{sub}</div>}</div>;
const Box = ({ t, children }: { t: string; children: React.ReactNode }) => <div className="space-y-2 rounded-2xl border bg-card p-4"><h3 className="font-bold">{t}</h3>{children}</div>;
const Line = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between text-sm"><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>;
const F = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="block space-y-1"><span className="text-xs text-muted-foreground">{t}</span>{children}</label>;
function StatusPill({ s }: { s: Order["status"] }) {
  const map = { aberta: ["Aberta", "bg-secondary"], cozinha: ["Na cozinha", "bg-warning/20 text-warning"], pronto: ["Pronto", "bg-success/20 text-success"], pago: ["Pago", ""], cancelado: ["Cancelado", ""] } as const;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[s][1]}`}>{map[s][0]}</span>;
}
