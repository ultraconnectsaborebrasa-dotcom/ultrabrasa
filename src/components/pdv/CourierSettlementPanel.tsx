import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Banknote, CheckCircle2, Clock3, CreditCard, EyeOff, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { brl } from '@/lib/pdv-store';
import { saoPauloDay } from '@/lib/courier-operations';
import { settlementTotals, SETTLEMENT_LABELS, type CourierSettlementRow } from '@/lib/courier-settlement';
import { DeliveryReceivablesPanel } from './DeliveryReceivablesPanel';
import { DeliveryPaymentDialog } from './DeliveryPaymentDialog';
import { openCloud } from '@/lib/pdv-cloud';

const SECTIONS: { category: CourierSettlementRow['category']; title: string }[] = [
  { category: 'cash', title: 'Dinheiro a repassar' },
  { category: 'card', title: 'Notas da maquininha / Pix' },
  { category: 'prepaid', title: 'Pagos antes da saída' },
  { category: 'store', title: 'Pagos na loja' },
  { category: 'pending', title: 'Ainda a receber' },
  { category: 'unverified', title: 'Comprovantes a confirmar' },
];

export function CourierSettlementPanel({ admin = false, courier = false, onPaid }: { admin?: boolean; courier?: boolean; onPaid?: () => Promise<void> }) {
  const [date, setDate] = useState(saoPauloDay);
  const [search, setSearch] = useState('');
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [view, setView] = useState<'summary' | 'receivables'>('summary');
  const [paymentOrder, setPaymentOrder] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['courier-settlement', date, courier, admin], gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('read_courier_settlement', { p_day: admin ? date : saoPauloDay() });
      if (error) throw new Error(error.message);
      return data as unknown as CourierSettlementRow[];
    }, refetchInterval: 5000,
  });
  const rows = query.data ?? [];
  const groups = [...new Map(rows.map(row => [row.courier_id, row.courier_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const normalizedSearch = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
  const matches = normalizedSearch ? groups.filter(([, name]) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(normalizedSearch)) : [];
  const visibleGroups = courier ? groups : matches.filter(([id]) => id === selectedCourier);
  const refreshPDV = admin ? openCloud : onPaid;
  return <section className="space-y-4">
    <header className="flex flex-wrap items-center gap-3 border-b pb-3">
      <div className="min-w-0 flex-1"><h2 className="text-xl font-bold">{courier ? 'Meu acerto de hoje' : 'Acerto dos entregadores'}</h2><p className="text-sm text-muted-foreground">{new Date(`${admin ? date : saoPauloDay()}T12:00:00`).toLocaleDateString('pt-BR')}</p></div>
      {admin && <input aria-label="Dia do acerto" className="field w-auto max-w-full" type="date" value={date} onChange={event => { setDate(event.target.value); setSelectedCourier(null); }} />}
      <Button variant="outline" size="icon" aria-label="Atualizar acerto" title="Atualizar acerto" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} /></Button>
    </header>
    {query.isPending && <p role="status">Carregando recebimentos…</p>}
    {query.error && <p role="alert" className="text-destructive">{query.error.message}</p>}
    <nav aria-label="Conferência do acerto" className="flex flex-wrap gap-2"><Button size="sm" variant={view === 'summary' ? 'default' : 'outline'} onClick={() => setView('summary')}>Resumo do acerto</Button><Button size="sm" variant={view === 'receivables' ? 'default' : 'outline'} onClick={() => setView('receivables')}><Clock3 size={16} />Recebimentos pendentes</Button></nav>
    {view === 'receivables' && <DeliveryReceivablesPanel key={`${date}-${courier}`} date={admin ? date : saoPauloDay()} courier={courier} {...(refreshPDV ? { onPaid: refreshPDV } : {})} />}
    {view === 'summary' && <>
    {!courier && <div className="space-y-3">
      <label htmlFor="settlement-courier-search" className="block text-sm font-semibold">Entregador</label>
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3">
        <Search size={18} className="shrink-0 text-muted-foreground" />
        <input id="settlement-courier-search" type="search" placeholder="Buscar pelo nome do entregador" value={search} onChange={event => { setSearch(event.target.value); setSelectedCourier(null); }} className="h-12 w-full min-w-0 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        {search && <Button variant="ghost" size="icon" aria-label="Limpar busca e ocultar acerto" title="Limpar busca e ocultar acerto" onClick={() => { setSearch(''); setSelectedCourier(null); }}><X size={18} /></Button>}
      </div>
      {!normalizedSearch && <div className="flex items-center justify-center gap-2 border-b py-10 text-sm text-muted-foreground"><EyeOff size={20} />Nenhum acerto selecionado</div>}
      {normalizedSearch && !query.isPending && !query.error && !matches.length && <p role="status" className="py-6 text-center text-sm text-muted-foreground">Nenhum entregador com acerto encontrado neste dia.</p>}
      {matches.length > 0 && !selectedCourier && <div className="divide-y border-y">{matches.map(([id, name]) => <Button key={id} variant="ghost" className="h-auto min-h-12 w-full justify-between gap-3 rounded-none px-3 py-3 text-left" onClick={() => setSelectedCourier(id)}><span className="min-w-0 break-words whitespace-normal">{name}</span><ArrowRight size={18} className="shrink-0" /></Button>)}</div>}
      {visibleGroups.length > 0 && <Button variant="outline" size="sm" onClick={() => setSelectedCourier(null)}><EyeOff size={16} />Ocultar acerto</Button>}
    </div>}
    {courier && !query.isPending && !query.error && !groups.length && <p className="border-b py-6 text-center text-muted-foreground">Nenhum pedido designado ou recebimento neste dia.</p>}
    <div className="space-y-5">{visibleGroups.map(([id, name]) => {
      const deliveries = rows.filter(row => row.courier_id === id);
      const courierTotals = settlementTotals(deliveries);
      const cashCount = deliveries.filter(row => row.category === 'cash').length;
      const cardCount = deliveries.filter(row => row.category === 'card').length;
      const paidCount = deliveries.filter(row => row.category === 'prepaid' || row.category === 'store').length;
      const pendingCount = deliveries.filter(row => row.category === 'pending').length;
      return <article key={id} className="min-w-0 space-y-4 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words text-lg font-bold">{courier ? 'Resumo do seu dia' : name}</h3><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{new Set(deliveries.map(row => row.order_id)).size} pedido(s)</span></div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border-l-4 border-success bg-success/10 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success/15 text-success"><Banknote size={24} /></span>
          <div className="min-w-0 flex-1"><span className="text-sm font-medium">{courier ? 'Você precisa repassar em dinheiro' : `${name} precisa repassar em dinheiro`}</span><strong className="block text-3xl text-success">{brl(courierTotals.cash)}</strong><span className="text-xs text-muted-foreground">{cashCount} pedido(s) recebido(s) em espécie</span></div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <CategoryCard icon={<CreditCard size={18} />} label="Maquininha / Pix" detail={`${cardCount} nota(s) · sem repasse em dinheiro`} value={courierTotals.card} />
          <CategoryCard icon={<CheckCircle2 size={18} />} label="Já pagos pela loja" detail={`${paidCount} pedido(s) · sem repasse`} value={courierTotals.prepaid + courierTotals.store} />
          <CategoryCard icon={<Clock3 size={18} />} label="Ainda a receber" detail={`${pendingCount} pedido(s)`} value={courierTotals.pending} warning />
        </div>
        {courierTotals.unverified > 0 && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">Há {brl(courierTotals.unverified)} em comprovantes ainda não confirmados pelo Caixa.</p>}
        <div className="grid gap-2 lg:grid-cols-2">{SECTIONS.map(section => {
          const sectionRows = deliveries.filter(row => row.category === section.category);
          if (!sectionRows.length) return null;
          return <details key={section.category} className="rounded-lg border bg-background">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><b>{section.title}</b><span className="block text-xs text-muted-foreground">{sectionRows.length} registro(s)</span></span><strong>{brl(settlementTotals(sectionRows)[section.category])}</strong></summary>
            <ul className="divide-y border-t">{sectionRows.map((row, index) => <li key={`${row.order_id}-${index}`} className="space-y-1 p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><b className="break-words">#{row.number} · {row.customer || 'Cliente'}</b><strong>{brl(Number(row.amount))}</strong></div>
              <p className={row.category === 'cash' ? 'text-success' : row.category === 'pending' || row.category === 'unverified' ? 'text-warning' : 'text-muted-foreground'}>{SETTLEMENT_LABELS[row.category]} · {row.method || 'Forma não informada'}</p>
              <p className="text-xs text-muted-foreground">{row.status}{row.paid_at ? ` · Recebido às ${new Date(row.paid_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
              {row.category === 'pending' && (!courier || !['Entregue', 'Cancelado'].includes(row.status)) && <Button size="sm" variant="outline" onClick={() => setPaymentOrder(row.order_id)}><Banknote size={16} />Conferir pedido e receber</Button>}
            </li>)}</ul>
          </details>;
        })}</div>
      </article>;
    })}</div></>}
    {paymentOrder && <DeliveryPaymentDialog orderId={paymentOrder} date={admin ? date : saoPauloDay()} onClose={() => setPaymentOrder(null)} {...(refreshPDV ? { onPaid: refreshPDV } : {})} />}
  </section>;
}

function CategoryCard({ icon, label, detail, value, warning = false }: { icon: ReactNode; label: string; detail: string; value: number; warning?: boolean }) {
  return <div className="rounded-lg border bg-background p-3"><div className={`flex items-center gap-2 text-sm ${warning ? 'text-warning' : 'text-muted-foreground'}`}>{icon}<span>{label}</span></div><strong className={`mt-2 block text-xl ${warning ? 'text-warning' : ''}`}>{brl(value)}</strong><span className="text-xs text-muted-foreground">{detail}</span></div>;
}
