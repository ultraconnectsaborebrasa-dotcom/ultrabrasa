import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, ShoppingCart, ClipboardList, ChefHat, Package, Wallet, Settings, History, ShieldCheck, LogOut, Wifi, WifiOff, LoaderCircle } from "lucide-react";
import { brl, isToday, useStore, useSaving } from "@/lib/pdv-store";
import { AccountGate, AdminTeam } from "@/components/pdv/AccountGate";
import { SalesHistory } from "@/components/pdv/SalesHistory";
import { Button } from "@/components/ui/button";
import { WindowMode } from "@/components/pdv/WindowMode";
import { useSyncStatus } from "@/lib/pdv-cloud";
import { SellView } from "@/components/pdv/SellView";
import { CashView, KitchenView, OrdersView, ProductsView, SettingsView } from "@/components/pdv/Views";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ultra Brasa PDV — Ponto de venda" },
      { name: "description", content: "PDV completo para espetaria e lanchonete: vendas, comandas, cozinha, estoque e caixa." },
      { property: "og:title", content: "Ultra Brasa PDV" },
      { property: "og:description", content: "Vendas, comandas, cozinha, estoque e caixa em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const TABS = [
  { id: "pdv", label: "Vender", icon: ShoppingCart, key: "1" },
  { id: "comandas", label: "Comandas", icon: ClipboardList, key: "2" },
  { id: "cozinha", label: "Cozinha", icon: ChefHat, key: "3" },
  { id: "produtos", label: "Produtos", icon: Package, key: "4" },
  { id: "caixa", label: "Caixa", icon: Wallet, key: "5" },
  { id: "ajustes", label: "Ajustes", icon: Settings, key: "6" },
  { id: "historico", label: "Histórico", icon: History, key: "7" },
  { id: "admin", label: "Admin", icon: ShieldCheck, key: "8" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function Index() {
  return <AccountGate>{(admin,name,signOut)=><Desk admin={admin} name={name} signOut={signOut}/>}</AccountGate>;
}
function Desk({admin,name,signOut}:{admin:boolean;name:string;signOut:()=>Promise<void>}) {
  const [tab, setTab] = useState<Tab>("pdv");
  const saving = useSaving();
  const sync = useSyncStatus();
  const tabs = TABS.filter(t=>admin || !['produtos','ajustes','admin'].includes(t.id));
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.altKey) { const t = tabs.find((x) => x.key === e.key); if (t) { e.preventDefault(); setTab(t.id); } }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [admin]);

  const store = useStore((s) => s.settings.storeName);
  const orders = useStore((s) => s.orders);
  const products = useStore((s) => s.products);
  const cashOpen = useStore((s) => s.cash.open);
  const today = orders.filter((o) => o.status === "pago" && isToday(o.paidAt ?? o.createdAt));
  const revenue = today.reduce((a, o) => a + o.payments.reduce((x, p) => x + p.amount, 0), 0);
  const open = orders.filter((o) => ["aberta", "cozinha", "pronto"].includes(o.status));
  const kitchen = orders.filter((o) => o.status === "cozinha").length;
  const low = products.filter((p) => p.stock !== null && p.stock <= p.minStock).length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-card/60 px-3 py-3 backdrop-blur sm:px-5">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-ember-gradient shadow-glow"><Flame size={18} className="text-primary-foreground" /></div>
          <div className="leading-tight"><div className="font-display text-lg font-bold">{store}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">PDV · Sabor e brasa</div></div>
        </div>
        <nav aria-label="Áreas do PDV" className="order-3 flex w-full gap-1 overflow-x-auto rounded-lg bg-background p-1 xl:order-none xl:w-auto">
          {tabs.map((t) => {
            const badge = t.id === "comandas" ? open.length : t.id === "cozinha" ? kitchen : t.id === "produtos" ? low : 0;
            return (
              <Button variant="ghost" key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab===t.id} title={t.label}
                className={`relative shrink-0 gap-1.5 px-3 text-xs font-semibold sm:text-sm ${tab === t.id ? "bg-elevated text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <t.icon size={15} /><span>{t.label}</span>
                {badge > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{badge}</span>}
              </Button>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-sm sm:gap-4">
          <span className="hidden text-xs text-muted-foreground sm:inline">{name} · {admin ? 'Administrador' : 'Atendente'}</span>
          <span title={sync==='live'?'Atualização automática conectada':sync==='offline'?'Sem conexão: confira sua internet':'Conectando dispositivos'} className={sync==='live'?'text-success':sync==='offline'?'text-destructive':'text-warning'}>{sync==='live'?<Wifi size={16}/>:sync==='offline'?<WifiOff size={16}/>:<LoaderCircle size={16} className="animate-spin"/>}</span>
          <WindowMode/>
          <Button variant="ghost" size="icon" title="Sair da conta" aria-label="Sair da conta" onClick={()=>void signOut()}><LogOut/></Button>
          <div className="hidden gap-4 lg:flex"><Stat k="Vendas hoje" v={brl(revenue)} /><Stat k="Pedidos" v={String(today.length)} /></div>
          <button onClick={() => setTab("caixa")} className={`rounded-full px-3 py-1 text-xs font-semibold ${cashOpen ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
            ● Caixa {cashOpen ? "aberto" : "fechado"}
          </button>
        </div>
      </header>
      <main key={tab} className="pdv-view-enter min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {tab === "pdv" ? <SellView admin={admin}/> : tab === "comandas" ? <OrdersView admin={admin} goSell={() => setTab("pdv")} /> : tab === "cozinha" ? <KitchenView />
          : tab === "historico" ? <SalesHistory/> : tab === "admin" && admin ? <AdminTeam/> : tab === "produtos" && admin ? <ProductsView /> : tab === "caixa" ? <CashView /> : admin ? <SettingsView /> : null}
      </main>
      {saving && <div role="status" className="fixed inset-0 z-50 flex items-center justify-center gap-3 bg-background/70 text-foreground"><LoaderCircle className="animate-spin"/>Salvando…</div>}
    </div>
  );
}
const Stat = ({ k, v }: { k: string; v: string }) => <div className="text-right leading-tight"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div><div className="font-mono font-bold">{v}</div></div>;
