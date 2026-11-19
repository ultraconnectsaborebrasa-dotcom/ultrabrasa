import { useMemo, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, ChevronUp, CircleDollarSign, Clock3, Map, MapPin, MessageCircle, Navigation, Phone, Printer, Route as RouteIcon, Search, Truck, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { addressText, canFinishDelivery, googleMapsLink, routeMapsLink, routeTotals, type Courier, type Delivery, type DeliveryRoute } from '@/lib/delivery';
import { currentKitchenDeliveries, currentKitchenRoutes } from '@/lib/delivery-operation';
import { brl } from '@/lib/pdv-store';
import { whatsappLink } from '@/lib/pdv-customers';
import { printDeliveryTicket, printRouteSheet } from '@/services/thermalPrinter';
import { CourierOperationsPanel } from './CourierOperationsPanel';

type EditorRoute = { id: string; name: string; courier: string; origin: string; stops: string[] };

export function DeliveryRoutesView({ admin, courier, deliveries, routes, couriers, busy, onAssign, onEdit, onFinish, onStart, onDeliver, onProblem, onPrepare }: {
  admin: boolean;
  courier: boolean;
  deliveries: Delivery[];
  routes: DeliveryRoute[];
  couriers: Courier[];
  busy: boolean;
  onAssign: (courierId: string, baseAddress: string, deliveryIds?: string[]) => void;
  onEdit: (route: EditorRoute) => void;
  onFinish: (id: string, name: string, status: 'Entregue' | 'Cancelado') => void;
  onStart: (id: string) => void;
  onDeliver: (id: string) => void;
  onProblem: (id: string, problem: string) => void;
  onPrepare: () => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  const [limit, setLimit] = useState(20);
  const [mapOpen, setMapOpen] = useState(!courier);
  const currentDeliveries = useMemo(() => currentKitchenDeliveries(deliveries), [deliveries]);
  const currentRoutes = useMemo(() => currentKitchenRoutes(routes, deliveries), [routes, deliveries]);
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const visibleRoutes = currentRoutes.filter(route => {
    if (!normalizedQuery) return true;
    const stops = currentDeliveries.filter(delivery => delivery.route_id === route.id);
    const courierName = couriers.find(driver => driver.id === route.courier_id)?.name ?? '';
    return `${route.name} ${courierName} ${stops.map(stop => `${stop.number} ${stop.customer} ${addressText(stop.address)}`).join(' ')}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery);
  });
  const displayedRoutes = visibleRoutes.slice(0, limit);
  const activeExpanded = expanded === undefined ? currentRoutes[0]?.id ?? null : expanded;
  const readyCount = currentDeliveries.filter(delivery => delivery.status === 'Pronto para entrega').length;
  const movingCount = currentDeliveries.filter(delivery => delivery.status === 'Em rota').length;

  function openMaps(url: string | null) {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.warning('Divida a rota em grupos de até 10 entregas para abrir o trajeto completo.');
  }

  function printRoute(route: DeliveryRoute, stops: Delivery[]) {
    toast.info(`Imprimindo ${route.name}…`);
    void printRouteSheet({ name: route.name, courier: couriers.find(driver => driver.id === route.courier_id)?.name ?? null }, stops)
      .then(() => toast.success(`${route.name} impressa.`))
      .catch(error => toast.error(error instanceof Error ? error.message : 'Falha ao imprimir a rota.'));
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Map size={20} /></div>
        <div><h3 className="font-semibold">Mapa da cidade e equipe ao vivo</h3><p className="text-xs text-muted-foreground">Toque em uma moto para localizar o motoboy e ver as entregas dele.</p></div>
      </div>
      <Button variant="outline" size="sm" onClick={() => setMapOpen(open => !open)}>{mapOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{mapOpen ? 'Recolher mapa' : 'Abrir mapa e equipe'}</Button>
    </div>

    {mapOpen && <CourierOperationsPanel admin={admin} courier={courier} deliveries={currentDeliveries} routes={currentRoutes} couriers={couriers} onAssign={onAssign} />}

    <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
      <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Saídas de hoje</p><p className="mt-1 text-xl font-bold">{currentDeliveries.length}</p></div>
      <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Prontas para sair</p><p className="mt-1 text-xl font-bold">{readyCount}</p></div>
      <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Na rua</p><p className="mt-1 text-xl font-bold">{movingCount}</p></div>
    </div>

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="font-semibold">Rotas das saídas atuais <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{currentRoutes.length}</span></h3><p className="mt-1 text-xs text-muted-foreground">Somente pedidos prontos ou na rua hoje. As concluídas continuam guardadas no Histórico.</p></div>
      <label className="relative block sm:w-80"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><input aria-label="Buscar rotas" className="field pl-9" placeholder="Pedido, cliente ou entregador" value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} /></label>
    </div>

    {!visibleRoutes.length && <div className="rounded-xl border border-dashed bg-card px-5 py-10 text-center">
      <CheckCircle2 size={32} className="mx-auto mb-3 text-success" />
      <h3 className="font-semibold">{normalizedQuery ? 'Nenhuma rota encontrada nesta busca' : 'Nenhuma rota montada com as saídas atuais'}</h3>
      <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">As saídas de hoje continuam visíveis no mapa. Para organizar uma nova rota, escolha uma entrega pronta e um motoboy.</p>
      {!courier && <Button className="mt-4" variant="outline" onClick={onPrepare}><RouteIcon size={16} />Ver pedidos e montar rota</Button>}
    </div>}

    <div className="space-y-4">{displayedRoutes.map(route => {
      const stops = currentDeliveries.filter(delivery => delivery.route_id === route.id).sort((a, b) => a.position - b.position);
      const open = stops.some(stop => canFinishDelivery(stop.status));
      const ready = stops.length > 0 && stops.every(stop => stop.status === 'Pronto para entrega');
      const moving = stops.some(stop => stop.status === 'Em rota');
      const waiting = stops.some(stop => stop.status === 'Aguardando preparo');
      const isExpanded = activeExpanded === route.id;
      const courierName = couriers.find(driver => driver.id === route.courier_id)?.name ?? 'Sem entregador';
      const totals = routeTotals(stops);
      const status = !open ? 'Concluída' : moving ? 'Saiu para entrega' : ready ? 'Pronta para sair' : waiting ? 'Aguardando preparo' : 'Em organização';
      return <article key={route.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Truck size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{route.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${open ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>{status}</span></div>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound size={13} />{courierName}</span><span>{stops.length} {stops.length === 1 ? 'entrega' : 'entregas'}</span><span className="inline-flex items-center gap-1"><Clock3 size={13} />{new Date(route.created_at).toLocaleString('pt-BR')}</span></p>
          </div>
          <Button size="icon" variant="ghost" aria-label={`${isExpanded ? 'Recolher' : 'Ver'} entregas da ${route.name}`} onClick={() => setExpanded(isExpanded ? null : route.id)}>{isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</Button>
        </div>

        <div className="flex flex-wrap gap-2 border-t px-4 py-3">
          {open && ready && route.courier_id && <Button disabled={busy} onClick={() => onStart(route.id)}><Navigation size={16} />Iniciar rota</Button>}
          {open && <Button disabled={busy} variant={ready && route.courier_id ? 'outline' : 'default'} onClick={() => onFinish(route.id, route.name, 'Entregue')}><Check size={16} />Concluir entregas</Button>}
          {open && !route.courier_id && !courier && <Button variant="outline" onClick={() => onEdit({ id: route.id, name: route.name, courier: '', origin: route.origin, stops: stops.map(stop => stop.id) })}><UserRound size={16} />Atribuir entregador</Button>}
          <Button variant="outline" size="sm" onClick={() => openMaps(routeMapsLink(stops, route.origin))}><MapPin size={15} />Navegar</Button>
          <Button variant="outline" size="sm" onClick={() => printRoute(route, stops)}><Printer size={15} />Imprimir</Button>
          {!courier && open && stops.every(stop => ['Aguardando preparo', 'Pronto para entrega'].includes(stop.status)) && <Button variant="ghost" size="sm" onClick={() => onEdit({ id: route.id, name: route.name, courier: route.courier_id ?? '', origin: route.origin, stops: stops.map(stop => stop.id) })}>Editar</Button>}
          {!courier && open && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onFinish(route.id, route.name, 'Cancelado')}><X size={15} />Cancelar</Button>}
          {stops.some(stop => stop.total !== null) && <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground"><CircleDollarSign size={15} />A receber: <b className="text-foreground">{brl(totals.cash + totals.card + totals.pix + totals.other)}</b></span>}
        </div>

        {isExpanded && <ol className="space-y-3 border-t bg-muted/30 p-3 sm:p-4">{stops.map((stop, index) => <li key={stop.id} className="relative rounded-lg border bg-background p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">#{stop.number} · {stop.customer || 'Cliente'}</h4><span className="text-xs text-muted-foreground">{stop.status === 'Em rota' ? 'Saiu para entrega' : stop.status}</span></div><button className="mt-2 flex items-start gap-2 text-left text-sm hover:text-primary" onClick={() => openMaps(googleMapsLink(stop.address))}><MapPin size={16} className="mt-0.5 shrink-0 text-primary" /><span>{addressText(stop.address)}{stop.address.reference && <small className="mt-1 block text-muted-foreground">Referência: {stop.address.reference}</small>}</span></button></div>
          </div>
          <div className="mt-3 grid gap-3 border-t pt-3 text-sm sm:grid-cols-2">
            <ul>{stop.items.map((item, itemIndex) => <li key={itemIndex}>{item.qty}× {item.name}{item.note && <span className="block text-xs text-muted-foreground">{item.note}</span>}</li>)}</ul>
            {stop.total !== null && <div className="sm:text-right"><p>{stop.payment_method} · {stop.payment_status === 'Pendente' ? 'a receber' : stop.payment_status ?? 'informado'}</p><p className="font-semibold">{brl(stop.due ?? 0)} <span className="font-normal text-muted-foreground">de {brl(stop.total)}</span></p>{(stop.change ?? 0) > 0 && <p className="text-xs text-muted-foreground">Troco: {brl(stop.change ?? 0)}</p>}</div>}
          </div>
          {stop.problem && <p className="mt-3 text-sm text-destructive">Problema: {stop.problem}</p>}
          {stop.delivered_at && <p className="mt-2 text-xs text-success">Entregue em {new Date(stop.delivered_at).toLocaleString('pt-BR')}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => openMaps(googleMapsLink(stop.address))}><Navigation size={14} />Navegar</Button>
            {stop.phone && <><Button size="icon" variant="outline" aria-label={`Ligar para ${stop.customer}`} onClick={() => { window.location.href = `tel:+${stop.phone.replace(/\D/g, '')}`; }}><Phone size={15} /></Button><Button size="icon" variant="outline" aria-label={`WhatsApp de ${stop.customer}`} onClick={() => window.open(whatsappLink(stop.phone, ''), '_blank', 'noopener,noreferrer')}><MessageCircle size={15} /></Button></>}
            <Button size="icon" variant="outline" aria-label={`Imprimir entrega ${stop.number}`} onClick={() => void printDeliveryTicket(stop).then(() => toast.success(`Entrega #${stop.number} impressa.`)).catch(error => toast.error(error instanceof Error ? error.message : 'Falha ao imprimir.'))}><Printer size={15} /></Button>
            {canFinishDelivery(stop.status) && <><Button size="sm" variant="ghost" onClick={() => onProblem(stop.id, stop.problem ?? '')}>Problema</Button><Button size="sm" className="ml-auto" disabled={busy} onClick={() => onDeliver(stop.id)}><Check size={15} />Marcar entregue</Button></>}
          </div>
        </li>)}</ol>}
      </article>;
    })}</div>
    {visibleRoutes.length > displayedRoutes.length && <div className="text-center"><Button variant="outline" onClick={() => setLimit(current => current + 20)}>Mostrar mais rotas · restam {visibleRoutes.length - displayedRoutes.length}</Button></div>}
  </div>;
}
