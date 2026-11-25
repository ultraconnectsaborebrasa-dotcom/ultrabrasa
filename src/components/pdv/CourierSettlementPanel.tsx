import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CreditCard, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { brl } from '@/lib/pdv-store';
import { saoPauloDay } from '@/lib/courier-operations';
import { settlementTotals, SETTLEMENT_LABELS, type CourierSettlementRow } from '@/lib/courier-settlement';

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
  const groups = [...new Map(rows.map(row => [row.courier_id, row.courier_name])).entries()];
  return <section className="space-y-4">
    <header className="flex flex-wrap items-center gap-3 border-b pb-3">
      <div className="min-w-0 flex-1"><h2 className="text-xl font-bold">{courier ? 'Meu acerto de hoje' : 'Acerto dos entregadores'}</h2><p className="text-sm text-muted-foreground">{new Date(`${admin ? date : saoPauloDay()}T12:00:00`).toLocaleDateString('pt-BR')}</p></div>
      {admin && <input aria-label="Dia do acerto" className="field w-auto" type="date" value={date} onChange={event => setDate(event.target.value)} />}
      <Button variant="outline" size="icon" aria-label="Atualizar acerto" title="Atualizar acerto" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} /></Button>
    </header>
    {query.isPending && <p role="status">Carregando recebimentos…</p>}
    {query.error && <p role="alert" className="text-destructive">{query.error.message}</p>}
    {!query.isPending && !query.error && !groups.length && <p className="py-4 text-muted-foreground">Nenhum pedido designado ou recebimento neste dia.</p>}
    <div className="space-y-6">{groups.map(([id, name]) => {
      const deliveries = rows.filter(row => row.courier_id === id);
      const totals = settlementTotals(deliveries);
      return <article key={id} className="min-w-0 space-y-3 rounded-lg border bg-card p-4">
        {!courier && <h3 className="break-words text-lg font-bold">{name}</h3>}
        <div className="flex items-center gap-3 border-l-4 border-success bg-success/10 p-3"><Banknote className="shrink-0 text-success" /><div><span className="text-sm font-medium">Dinheiro recebido a repassar</span><strong className="block text-2xl text-success">{brl(totals.cash)}</strong></div></div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0 border-b pb-2"><dt className="flex items-center gap-1 text-muted-foreground"><CreditCard size={15} />Maquininha</dt><dd className="font-bold">{brl(totals.card)}</dd></div>
          <div className="min-w-0 border-b pb-2"><dt className="flex items-center gap-1 text-muted-foreground"><CheckCircle2 size={15} />Pago antes da saída</dt><dd className="font-bold">{brl(totals.prepaid)}</dd></div>
          <div className="min-w-0"><dt className="text-muted-foreground">Ainda a receber</dt><dd className="font-bold text-warning">{brl(totals.pending)}</dd></div>
          <div className="min-w-0"><dt className="text-muted-foreground">Pago na loja / origem não identificada</dt><dd className="font-bold">{brl(totals.store)}</dd></div>
        </dl>
        {totals.unverified > 0 && <p className="text-sm text-warning">Comprovantes sem confirmação: {brl(totals.unverified)}</p>}
        <details><summary className="cursor-pointer py-2 text-sm font-semibold">Notas e pedidos · {new Set(deliveries.map(row => row.order_id)).size}</summary>
          <ul className="divide-y">{deliveries.map((row, index) => <li key={`${row.order_id}-${index}`} className="space-y-1 py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><b className="break-words">#{row.number} · {row.customer || 'Cliente'}</b><strong>{brl(Number(row.amount))}</strong></div>
            <p className={row.category === 'cash' ? 'text-success' : row.category === 'pending' ? 'text-warning' : 'text-muted-foreground'}>{SETTLEMENT_LABELS[row.category]} · {row.method}</p>
            <p className="text-xs text-muted-foreground">{row.status}{row.paid_at ? ` · Recebido às ${new Date(row.paid_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
          </li>)}</ul>
        </details>
      </article>;
    })}</div>
  </section>;
}