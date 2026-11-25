import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  ListOrdered,
  Map,
  MapPin,
  MessageCircle,
  Navigation,
  PackageCheck,
  Phone,
  RefreshCw,
  Route as RouteIcon,
  Truck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/lib/confirm-action';
import { addressText, canFinishDelivery, courierMarmitaStock, googleMapsLink, partitionDeliveryRoutes, type Courier, type Delivery, type DeliveryRoute, type MarmitaProduct } from '@/lib/delivery';
import { showCourierMarmitaStock } from '@/lib/courier-operations';
import { brl } from '@/lib/pdv-store';
import { whatsappLink } from '@/lib/pdv-customers';
import { courierRouteProgress, courierRouteStatus } from '@/lib/courier-route';
import { CourierOperationsPanel } from './CourierOperationsPanel';

function openMaps(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function statusClass(status: string) {
  if (status === 'Entregue' || status === 'Concluída') return 'bg-success/10 text-success';
  if (status === 'Em rota') return 'bg-primary/10 text-primary';
  return 'bg-warning/10 text-warning';
}

export function CourierDeliveryExperience({
  deliveries,
  routes,
  couriers,
  marmitaProducts = [],
  busy,
  loading,
  refreshing,
  error,
  onRefresh,
  onStart,
  onArrived,
  onReceivePayment,
  onDeliver,
  onProblem,
}: {
  deliveries: Delivery[];
  routes: DeliveryRoute[];
  couriers: Courier[];
  marmitaProducts?: MarmitaProduct[];
  busy: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string;
  onRefresh: () => void;
  onStart: (routeId: string) => void;
  onArrived?: (deliveryId: string) => void;
  onReceivePayment?: (orderId: string, method: string) => void;
  onDeliver: (deliveryId: string) => void;
  onProblem: (deliveryId: string, problem: string) => Promise<boolean>;
}) {
  const [showMarmitas, setShowMarmitas] = useState(true);
  useEffect(() => { const update = () => setShowMarmitas(showCourierMarmitaStock()); update(); const interval = window.setInterval(update, 30000); return () => window.clearInterval(interval); }, []);
  const [mode, setMode] = useState<'current' | 'history'>('current');
  const [routeId, setRouteId] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ delivery: Delivery; text: string } | null>(null);
  const [problemBusy, setProblemBusy] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const partitioned = useMemo(() => partitionDeliveryRoutes(routes, deliveries), [routes, deliveries]);
  const route = partitioned.active.find(item => item.id === routeId) ?? partitioned.active[0] ?? null;
  const stops = useMemo(() => deliveries.filter(delivery => delivery.route_id === route?.id), [deliveries, route?.id]);
  const progress = courierRouteProgress(stops);
  const activeArrival = progress.ordered.find(stop => stop.arrived_at && canFinishDelivery(stop.status)) ?? null;
  const selectedStop = activeArrival ?? progress.ordered.find(stop => stop.id === stopId) ?? progress.nextStop ?? progress.ordered[0] ?? null;
  const ownStock = courierMarmitaStock(couriers[0], deliveries);

  async function confirmDelivery(delivery: Delivery) {
    if (!await confirmAction(`Confirmar que o pedido #${delivery.number} foi entregue a ${delivery.customer || 'o cliente'}?`)) return;
    onDeliver(delivery.id);
  }

  async function receivePayment(delivery: Delivery) {
    if (!onReceivePayment) return;
    onReceivePayment(delivery.order_id, delivery.payment_method ?? '');
  }

  async function saveProblem() {
    if (!problem?.text.trim()) return;
    setProblemBusy(true);
    const saved = await onProblem(problem.delivery.id, problem.text.trim());
    setProblemBusy(false);
    if (saved) setProblem(null);
  }

  return <section aria-label="Minhas corridas de entrega" className="space-y-4">
    <header className="flex items-center gap-3">
      <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Truck size={22} /></div>
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-black ">Minhas entregas</h2>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-success" /> Atualização automática</p>
      </div>
      <Button variant="outline" size="icon" aria-label="Atualizar minhas entregas" disabled={refreshing} onClick={onRefresh}><RefreshCw className={refreshing ? 'animate-spin' : ''} size={18} /></Button>
    </header>

    {showMarmitas && couriers[0] && <div className="rounded-lg border bg-card p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Minhas marmitas</h3><p className="text-xs text-muted-foreground">{couriers[0].product_name ?? 'Carga ainda não registrada'}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${couriers[0].operational_status === 'returning' ? 'bg-warning/10 text-warning' : (couriers[0].operational_status ?? 'available') === 'available' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{couriers[0].operational_status === 'returning' ? 'Voltando à base' : (couriers[0].operational_status ?? 'available') === 'available' ? 'Disponível' : 'Indisponível'}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-muted/50 p-2"><b className="block text-xl">{ownStock.remaining ?? '—'}</b><span className="text-[10px] text-muted-foreground">Comigo</span></div><div className="rounded-lg bg-muted/50 p-2"><b className="block text-xl">{ownStock.reserved}</b><span className="text-[10px] text-muted-foreground">Reservadas</span></div><div className="rounded-lg bg-primary/10 p-2"><b className="block text-xl text-primary">{ownStock.available ?? '—'}</b><span className="text-[10px] text-muted-foreground">Livres</span></div></div></div>}
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {loading ? <div role="status" className="grid min-h-56 place-items-center rounded-lg border bg-card p-6 text-center"><div><RefreshCw className="mx-auto mb-3 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Buscando seus pedidos designados…</p></div></div> : <>
      <nav aria-label="Visualização das entregas" className="grid grid-cols-2 rounded-lg bg-muted p-1.5">
        <Button variant={mode === 'current' ? 'default' : 'ghost'} className="rounded-lg" onClick={() => setMode('current')}>Em andamento · {partitioned.active.length}</Button>
        <Button variant={mode === 'history' ? 'default' : 'ghost'} className="rounded-lg" onClick={() => setMode('history')}>Concluídas · {partitioned.completed.length}</Button>
      </nav>

      {mode === 'history' ? <div className="space-y-3">
        {!partitioned.completed.length && <EmptyState title="Nenhuma entrega concluída" description="Seu histórico de rotas finalizadas aparecerá aqui." />}
        {partitioned.completed.map(item => {
          const routeStops = deliveries.filter(delivery => delivery.route_id === item.id);
          const delivered = routeStops.filter(delivery => delivery.status === 'Entregue').length;
          return <article key={item.id} className="flex items-center gap-3 rounded-lg border bg-card p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success/10 text-success"><CheckCircle2 size={20} /></span>
            <div className="min-w-0 flex-1"><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{delivered} de {routeStops.length} entregue(s) · {new Date(item.created_at).toLocaleDateString('pt-BR')}</p></div>
          </article>;
        })}
      </div> : !route ? <EmptyState title="Nenhum pedido designado" description="Quando a loja designar uma entrega, ela aparecerá aqui com o endereço e as paradas." /> : <>
        {partitioned.active.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1">{partitioned.active.map((item, index) => <Button key={item.id} size="sm" variant={item.id === route.id ? 'default' : 'outline'} className="shrink-0" onClick={() => { setRouteId(item.id); setStopId(null); }}><RouteIcon size={14} />Rota {index + 1} · {item.name}</Button>)}</div>}

        <article className="overflow-hidden rounded-lg border bg-card shadow-lg">
          <div className="border-b bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[11px] font-bold uppercase  text-primary">Sua rota</p><h3 className="mt-1 font-bold">{route.name}</h3></div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(courierRouteStatus(stops))}`}>{courierRouteStatus(stops)}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-background/80 p-2.5"><b className="block text-xl">{stops.length}</b><span className="text-[10px] text-muted-foreground">paradas</span></div>
              <div className="rounded-lg bg-background/80 p-2.5"><b className="block text-xl">{progress.delivered}</b><span className="text-[10px] text-muted-foreground">entregues</span></div>
              <div className="rounded-lg bg-background/80 p-2.5"><b className="block text-xl">{Math.max(0, stops.length - progress.delivered)}</b><span className="text-[10px] text-muted-foreground">restantes</span></div>
            </div>
          </div>

          {selectedStop && <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-primary"><Navigation size={15} /><span>{canFinishDelivery(selectedStop.status) ? 'PRÓXIMA PARADA' : 'PARADA CONCLUÍDA'}</span><span className="ml-auto text-muted-foreground">{selectedStop.position || progress.ordered.indexOf(selectedStop) + 1} de {stops.length}</span></div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div><h3 className="text-2xl font-black ">{selectedStop.customer || 'Cliente'}</h3><p className="mt-0.5 text-sm text-muted-foreground">Pedido #{selectedStop.number}</p></div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(selectedStop.status)}`}>{selectedStop.status === 'Em rota' ? 'Em rota' : selectedStop.status}</span>
            </div>

            <button type="button" className="mt-4 flex w-full items-start gap-3 rounded-lg border bg-background p-4 text-left transition-colors hover:border-primary" onClick={() => openMaps(googleMapsLink(selectedStop.address))}>
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><MapPin size={20} /></span>
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{addressText(selectedStop.address)}</span>{selectedStop.address.reference && <span className="mt-1.5 block break-words text-xs text-muted-foreground">Referência: {selectedStop.address.reference}</span>}<span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">Abrir no mapa <ArrowRight size={13} /></span></span>
            </button>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/60 p-3"><p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><PackageCheck size={14} /> Itens do pedido</p><ul className="mt-2 space-y-1 text-sm">{selectedStop.items.map((item, index) => <li key={index}><b>{item.qty}×</b> {item.name}{item.note && <span className="block text-xs text-muted-foreground">{item.note}</span>}</li>)}</ul></div>
              {selectedStop.total !== null && <div className="rounded-lg bg-muted/60 p-3"><p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><CircleDollarSign size={14} /> Pagamento</p><p className="mt-2 text-sm font-semibold">{selectedStop.payment_method} · {selectedStop.payment_status === 'Pendente' ? 'receber na entrega' : selectedStop.payment_status ?? 'informado'}</p><p className="mt-1 text-lg font-black">{brl(selectedStop.due ?? 0)} <span className="text-xs font-normal text-muted-foreground">de {brl(selectedStop.total)}</span></p>{(selectedStop.change ?? 0) > 0 && <p className="text-xs text-muted-foreground">Troco: {brl(selectedStop.change ?? 0)}</p>}</div>}
            </div>

            {selectedStop.phone && <div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => { window.location.href = `tel:+${selectedStop.phone.replace(/\D/g, '')}`; }}><Phone size={16} /> Ligar</Button><Button variant="outline" onClick={() => openMaps(whatsappLink(selectedStop.phone, ''))}><MessageCircle size={16} /> WhatsApp</Button></div>}

            <div className="mt-5 space-y-2">
              {progress.ready && route.courier_id && <Button size="lg" className="h-14 w-full rounded-lg text-base font-bold" disabled={busy} onClick={() => onStart(route.id)}><Navigation size={20} /> Iniciar rota</Button>}
              {!progress.ready && canFinishDelivery(selectedStop.status) && <>
                <Button size="lg" variant="outline" className="h-12 w-full rounded-lg" onClick={() => openMaps(googleMapsLink(selectedStop.address))}><Navigation size={18} /> Navegar até o cliente</Button>
                {onArrived && !selectedStop.arrived_at && <Button size="lg" variant="outline" className="h-12 w-full rounded-lg" disabled={busy} onClick={() => onArrived(selectedStop.id)}><MapPin size={18} /> Confirmar chegada</Button>}
                {selectedStop.arrived_at && <p role="status" className="rounded-lg bg-primary/10 p-3 text-center text-xs font-medium text-primary">Chegada registrada às {new Date(selectedStop.arrived_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
                <Button size="lg" className="h-14 w-full rounded-lg text-base font-bold" disabled={busy || progress.waiting} onClick={() => void confirmDelivery(selectedStop)}><Check size={20} /> Confirmar entrega</Button>
              </>}
              {onReceivePayment && (selectedStop.due ?? 0) > 0 && canFinishDelivery(selectedStop.status) && <Button size="lg" variant="outline" className="h-12 w-full rounded-lg" disabled={busy} onClick={() => void receivePayment(selectedStop)}><CircleDollarSign size={18} /> Registrar recebimento · {brl(selectedStop.due ?? 0)}</Button>}
              {progress.waiting && <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning"><Clock3 className="mt-0.5 shrink-0" size={15} /> A loja ainda está preparando um ou mais pedidos desta rota.</p>}
              {canFinishDelivery(selectedStop.status) && <Button variant="ghost" className="w-full text-muted-foreground" disabled={busy} onClick={() => setProblem({ delivery: selectedStop, text: selectedStop.problem ?? '' })}><AlertTriangle size={15} /> Não consegui entregar</Button>}
            </div>
          </div>}
        </article>

        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2"><ListOrdered size={18} className="text-primary" /><div><h3 className="font-bold">Paradas da rota</h3><p className="text-xs text-muted-foreground">Toque em uma parada para ver os dados e as ações.</p></div></div>
          <ol className="mt-5 space-y-0">{progress.ordered.map((stop, index) => {
            const selected = stop.id === selectedStop?.id;
            const done = stop.status === 'Entregue';
            return <li key={stop.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < progress.ordered.length - 1 && <span aria-hidden="true" className={`absolute bottom-0 left-[15px] top-8 w-0.5 ${done ? 'bg-success/40' : 'bg-border'}`} />}
              <span className={`z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-black ${done ? 'border-success bg-success text-background' : selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground'}`}>{done ? <Check size={15} /> : index + 1}</span>
              <button type="button" aria-pressed={selected} disabled={Boolean(activeArrival && activeArrival.id !== stop.id)} title={activeArrival && activeArrival.id !== stop.id ? 'Conclua ou registre uma ocorrência na entrega já iniciada' : 'Escolher esta parada'} onClick={() => setStopId(stop.id)} className={`min-w-0 flex-1 rounded-lg border p-3 text-left transition-all disabled:opacity-50 ${selected ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background hover:border-primary/50'}`}>
                <span className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-sm">#{stop.number} · {stop.customer || 'Cliente'}</b><span className={`text-[10px] font-semibold ${done ? 'text-success' : 'text-muted-foreground'}`}>{stop.status === 'Em rota' ? 'Em rota' : stop.status}</span></span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{stop.address.street}, {stop.address.number} · {stop.address.neighborhood}</span>
              </button>
            </li>;
          })}</ol>
        </section>

        <details open={operationsOpen} onToggle={event => setOperationsOpen(event.currentTarget.open)} className="group rounded-lg border bg-card p-4">
          <summary className="flex cursor-pointer list-none items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Map size={18} /></span><span className="min-w-0 flex-1"><b className="block text-sm">{showMarmitas ? 'Mapa e carga' : 'Mapa das entregas'}</b><span className="text-xs text-muted-foreground">Abra somente quando precisar usar.</span></span><ChevronDown size={17} className="transition-transform group-open:rotate-180" /></summary>
          {operationsOpen && <div className="mt-4 border-t pt-4"><CourierOperationsPanel courier deliveries={deliveries} routes={routes} couriers={couriers} marmitaProducts={marmitaProducts} onAssign={() => {}} /></div>}
        </details>
      </>}
    </>}

    {problem && <div role="dialog" aria-modal="true" aria-label="Informar problema na entrega" className="fixed inset-0 z-50 grid place-items-end bg-background/80 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl border bg-card p-5 shadow-2xl sm:rounded-lg">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning"><AlertTriangle size={20} /></span><div className="min-w-0 flex-1"><h3 className="text-lg font-bold">O que aconteceu?</h3><p className="text-sm text-muted-foreground">Pedido #{problem.delivery.number} · {problem.delivery.customer}</p></div><Button size="icon" variant="ghost" aria-label="Fechar problema" onClick={() => setProblem(null)}><X size={18} /></Button></div>
        <textarea autoFocus aria-label="Descrever problema" className="field mt-4 min-h-28 w-full" placeholder="Ex.: cliente não atendeu, endereço não localizado…" value={problem.text} onChange={event => setProblem({ ...problem, text: event.target.value })} />
        <p className="mt-2 text-xs text-muted-foreground">A equipe verá o motivo. O pedido não será marcado como entregue.</p>
        <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" disabled={problemBusy} onClick={() => setProblem(null)}>Cancelar</Button><Button disabled={problemBusy || !problem.text.trim()} onClick={() => void saveProblem().catch(error => toast.error(error instanceof Error ? error.message : 'Não foi possível registrar o problema.'))}>{problemBusy ? 'Salvando…' : 'Enviar para a loja'}</Button></div>
      </div>
    </div>}
  </section>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-64 place-items-center rounded-lg border border-dashed bg-card p-8 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary"><Navigation size={30} /></span><h3 className="mt-4 text-lg font-bold">{title}</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p></div></div>;
}
