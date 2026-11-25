import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CheckCircle2, Clock3, CreditCard, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { brl } from '@/lib/pdv-store';
import { saoPauloDay } from '@/lib/courier-operations';
import { settlementTotals, SETTLEMENT_LABELS, type CourierSettlementRow } from '@/lib/courier-settlement';

const SECTIONS: { category: CourierSettlementRow['category']; title: string }[] = [
  { category: 'cash', title: 'Dinheiro a repassar' },
  { category: 'card', title: 'Notas da maquininha' },
  { category: 'prepaid', title: 'Pagos antes da saída' },
  { category: 'store', title: 'Pagos na loja' },
  { category: 'pending', title: 'Ainda a receber' },
  { category: 'unverified', title: 'Comprovantes a confirmar' },
];

export function CourierSettlementPanel({ admin = false, courier = false }: { admin?: boolean; courier?: boolean }) {
  const [date, setDate] = useState(saoPauloDay);
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
  const totals = settlementTotals(rows);
  return <section className="space-y-4">
    <header className="flex flex-wrap items-center gap-3 border-b pb-3">
      <div className="min-w-0 flex-1"><h2 className="text-xl font-bold">{courier ? 'Meu acerto de hoje' : 'Acerto dos entregadores'}</h2><p className="text-sm text-muted-foreground">Dinheiro, maquininha e pagamentos separados para conferir sem dúvida · {new Date(`${admin ? date : saoPauloDay()}T12:00:00`).toLocaleDateString('pt-BR')}</p></div>
      {admin && <input aria-label="Dia do acerto" className="field w-auto" type="date" value={date} onChange={event => setDate(event.target.value)} />}
      <Button variant="outline" size="icon" aria-label="Atualizar acerto" title="Atualizar acerto" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} /></Button>
    </header>
    {query.isPending && <p role="status">Carregando recebimentos…</p>}
    {query.error && <p role="alert" className="text-destructive">{query.error.message}</p>}
    {!query.isPending && !query.error && !groups.length && <p className="rounded-lg border border-dashed py-6 text-center text-muted-foreground">Nenhum pedido designado ou recebimento neste dia.</p>}
    {admin && groups.length > 1 && <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3 lg:grid-cols-4">
      <Summary label="Dinheiro a receber da equipe" value={totals.cash} emphasis />
      <Summary label="Maquininha" value={totals.card} />
      <Summary label="Já pagos" value={totals.prepaid + totals.store} />
      <Summary label="Ainda a receber" value={totals.pending} warning />
    </div>}
    <div className="space-y-5">{groups.map(([id, name]) => {
      const deliveries = rows.filter(row => row.courier_id === id);
      const courierTotals = settlementTotals(deliveries);
      const cashCount = deliveries.filter(row => row.category === 'cash').length;
      const cardCount = deliveries.filter(row => row.category === 'card').length;
      const paidCount = deliveries.filter(row => row.category === 'prepaid' || row.category === 'store').length;
      const pendingCount = deliveries.filter(row => row.category === 'pending').length;
      return <article key={id} className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words text-lg font-bold">{courier ? 'Resumo do seu dia' : name}</h3><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{new Set(deliveries.map(row => row.order_id)).size} pedido(s)</span></div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-l-4 border-success bg-success/10 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success/15 text-success"><Banknote size={24} /></span>
          <div className="min-w-0 flex-1"><span className="text-sm font-medium">{courier ? 'Você precisa repassar em dinheiro' : `${name} precisa repassar em dinheiro`}</span><strong className="block text-3xl text-success">{brl(courierTotals.cash)}</strong><span className="text-xs text-muted-foreground">{cashCount} pedido(s) recebido(s) em espécie</span></div>
        </div>
        <p className="text-sm text-muted-foreground"><b className="text-foreground">O que entregar à loja:</b> somente o valor em destaque. Maquininha e pedidos já pagos não entram no repasse em espécie.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <CategoryCard icon={<CreditCard size={18} />} label="Maquininha" detail={`${cardCount} pedido(s)`} value={courierTotals.card} />
          <CategoryCard icon={<CheckCircle2 size={18} />} label="Já pagos" detail={`${paidCount} pedido(s)`} value={courierTotals.prepaid + courierTotals.store} />
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
            </li>)}</ul>
          </details>;
        })}</div>
      </article>;
    })}</div>
  </section>;
}

function Summary({ label, value, emphasis = false, warning = false }: { label: string; value: number; emphasis?: boolean; warning?: boolean }) {
  return <div className="rounded-lg bg-background p-3"><span className="block text-xs text-muted-foreground">{label}</span><strong className={`mt-1 block text-lg ${emphasis ? 'text-success' : warning ? 'text-warning' : ''}`}>{brl(value)}</strong></div>;
}

function CategoryCard({ icon, label, detail, value, warning = false }: { icon: ReactNode; label: string; detail: string; value: number; warning?: boolean }) {
  return <div className="rounded-lg border bg-background p-3"><div className={`flex items-center gap-2 text-sm ${warning ? 'text-warning' : 'text-muted-foreground'}`}>{icon}<span>{label}</span></div><strong className={`mt-2 block text-xl ${warning ? 'text-warning' : ''}`}>{brl(value)}</strong><span className="text-xs text-muted-foreground">{detail}</span></div>;
}
