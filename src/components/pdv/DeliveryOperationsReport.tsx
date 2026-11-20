import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Clock3, PackageCheck, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { saoPauloDay } from '@/lib/courier-operations';

type Report = {
  summary: { distributed: number; replenished: number; sold: number; returned: number; losses: number; remaining: number; deliveries: number; cancelled: number; occurrences: number; average_minutes: number };
  days: { day: string; distributed: number; sold: number; deliveries: number; cancelled: number }[];
  couriers: { courier_id: string; name: string; operational_status: string; remaining: number | null; reserved: number; available: number | null; product_name: string | null; pending: number; delivered: number; average_minutes: number }[];
  journeys: { journey_id: string; courier_name: string; product_name: string; started_at: string; distributed: number; sold: number; returned: number; losses: number; adjustments: number; status: string }[];
};

const statusLabel: Record<string, string> = { on_route: 'Em operação', empty: 'Estoque zerado', returned: 'Devolvida', closed: 'Encerrada' };
const number = (value: number | null | undefined) => value === null || value === undefined ? '—' : new Intl.NumberFormat('pt-BR').format(value);

export function DeliveryOperationsReport({ courier = false }: { courier?: boolean }) {
  const [from, setFrom] = useState(saoPauloDay);
  const [to, setTo] = useState(saoPauloDay);
  const query = useQuery({
    queryKey: ['delivery-operational-report', from, to, courier],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('read_delivery_operational_report', { p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      return data as unknown as Report;
    },
  });
  const report = query.data;
  return <section className="space-y-4 rounded-xl border bg-card p-4" aria-label={courier ? 'Relatório da minha jornada' : 'Relatório operacional de entregas'}>
    <div className="flex flex-wrap items-end gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><BarChart3 size={20} /></span>
      <div className="min-w-48 flex-1"><h3 className="font-bold">{courier ? 'Minha jornada' : 'Relatório operacional'}</h3><p className="text-xs text-muted-foreground">Cargas, marmitas e entregas, sem valores financeiros.</p></div>
      <label className="text-xs">De<input aria-label="Relatório de" type="date" className="field ml-2 w-auto" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label>
      <label className="text-xs">Até<input aria-label="Relatório até" type="date" className="field ml-2 w-auto" value={to} min={from} onChange={event => setTo(event.target.value)} /></label>
      <Button size="icon" variant="outline" aria-label="Atualizar relatório" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} /></Button>
    </div>
    {query.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{query.error.message}</p>}
    {query.isPending ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Calculando operação…</p> : report && <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Metric label="Distribuídas" value={report.summary.distributed} />
        <Metric label="Vendidas" value={report.summary.sold} />
        <Metric label="Devolvidas" value={report.summary.returned} />
        <Metric label="Perdas" value={report.summary.losses} />
        <Metric label="Restantes" value={report.summary.remaining} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-muted/50 p-3 text-sm">
        <span className="inline-flex items-center gap-1.5"><PackageCheck size={15} className="text-primary" />Entregas: <b>{report.summary.deliveries}</b></span>
        <span className="inline-flex items-center gap-1.5"><Clock3 size={15} className="text-primary" />Tempo médio: <b>{number(report.summary.average_minutes)} min</b></span>
        <span>Cancelados: <b>{report.summary.cancelled}</b></span>
        <span className="inline-flex items-center gap-1.5"><TriangleAlert size={15} className="text-warning" />Ocorrências: <b>{report.summary.occurrences}</b></span>
        <span>Reposição: <b>{report.summary.replenished}</b></span>
      </div>

      {!courier && <details className="rounded-xl border bg-background p-3"><summary className="cursor-pointer text-sm font-semibold">Desempenho por entregador · {report.couriers.length}</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted text-left"><tr><th className="p-2">Entregador</th><th>Carga atual</th><th>Reservadas</th><th>Disponíveis</th><th>Pendentes</th><th>Entregues</th><th>Tempo médio</th></tr></thead><tbody>{report.couriers.map(driver => <tr key={driver.courier_id} className="border-b"><td className="p-2"><b>{driver.name}</b><span className="block text-xs text-muted-foreground">{driver.operational_status === 'available' ? 'Disponível' : driver.operational_status === 'returning' ? 'Voltando à base' : 'Indisponível'}</span></td><td>{number(driver.remaining)}</td><td>{driver.reserved}</td><td className="font-semibold text-primary">{number(driver.available)}</td><td>{driver.pending}</td><td>{driver.delivered}</td><td>{number(driver.average_minutes)} min</td></tr>)}</tbody></table></div></details>}

      <div className="space-y-3"><h4 className="flex items-center gap-2 text-sm font-semibold"><RotateCcw size={16} className="text-primary" />Histórico de cargas e jornadas</h4>
        {!report.journeys.length ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhuma carga registrada neste período.</p> : <div className="grid gap-2 lg:grid-cols-2">{report.journeys.map(journey => <article key={journey.journey_id} className="rounded-xl border bg-background p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><b>{journey.courier_name}</b><p className="text-xs text-muted-foreground">{journey.product_name} · {new Date(journey.started_at).toLocaleString('pt-BR')}</p></div><span className="rounded-full bg-muted px-2 py-1 text-[11px]">{statusLabel[journey.status] ?? journey.status}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6"><span>Carga<b className="block text-base">{journey.distributed}</b></span><span>Vendidas<b className="block text-base">{journey.sold}</b></span><span>Devolvidas<b className="block text-base">{journey.returned}</b></span><span>Perdas<b className="block text-base">{journey.losses}</b></span><span>Ajustes<b className="block text-base">{journey.adjustments > 0 ? '+' : ''}{journey.adjustments}</b></span><span>Final<b className="block text-base text-primary">{journey.distributed - journey.sold - journey.returned - journey.losses + journey.adjustments}</b></span></div></article>)}</div>}
      </div>
      <details className="rounded-xl border bg-background p-3"><summary className="cursor-pointer text-sm font-semibold">Totais por dia</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="bg-muted text-left"><tr><th className="p-2">Dia</th><th>Distribuídas</th><th>Vendidas</th><th>Entregas</th><th>Cancelados</th></tr></thead><tbody>{report.days.map(day => <tr key={day.day} className="border-b"><td className="p-2">{new Date(day.day).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td><td>{day.distributed}</td><td>{day.sold}</td><td>{day.deliveries}</td><td>{day.cancelled}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-background p-2.5 text-center"><span className="block text-[11px] text-muted-foreground">{label}</span><b className="text-xl">{number(value)}</b></div>;
}
