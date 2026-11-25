import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Boxes, Clock3, Crosshair, Eye, EyeOff, LocateFixed, MapPin, Motorbike, Navigation, PackageCheck, PackagePlus, Pencil, Radio, Route as RouteIcon, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { brl } from '@/lib/pdv-store';
import { canReadCourierOperations, COURIER_SHIFTS, courierTimeTotals, isCourierLocationStale, saoPauloDay, type CourierOperations, type DeliveryRouteCalculation } from '@/lib/courier-operations';
import { canCorrectDeliveryMapPin, courierMarmitaStock as stockFor, deliveryCoordinates, deliveryMarmitaQuantity, filterCouriersByAvailability, type Courier, type Delivery, type DeliveryRoute, type MarmitaProduct } from '@/lib/delivery';
import { courierActiveDeliveries } from '@/lib/delivery-dispatch';
import { deliveryZone } from '@/lib/eunapolis-delivery';
import { calculateDeliveryRoute, saveDeliveryMapPin } from '@/lib/delivery-route.functions';
import { LiveDeliveryMap, type DeliveryLocationDraft, type DeliveryMapFocus } from './LiveDeliveryMap';
import { AvailableDeliveryPanel } from './AvailableDeliveryPanel';
import { DeliveryOperationsReport } from './DeliveryOperationsReport';
import { DeliveryOperatingHours } from './DeliveryOperatingHours';

const clockTime = (value: string | null) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';

export function CourierOperationsPanel({ admin = false, manager = false, courier = false, deliveries, routes, couriers, marmitaProducts = [], onAssign }: {
  admin?: boolean;
  manager?: boolean;
  courier?: boolean;
  deliveries: Delivery[];
  routes: DeliveryRoute[];
  couriers: Courier[];
  marmitaProducts?: MarmitaProduct[];
  onAssign: (courierId: string, baseAddress: string, deliveryIds?: string[]) => void;
}) {
  const canManage = admin || manager;
  const client = useQueryClient();
  const [day, setDay] = useState(saoPauloDay);
  const [routeId, setRouteId] = useState('');
  const [route, setRoute] = useState<(DeliveryRouteCalculation & { routeId: string }) | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [focus, setFocus] = useState<DeliveryMapFocus>({ type: 'all', token: 0 });
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<string[]>([]);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [locationDraft, setLocationDraft] = useState<DeliveryLocationDraft | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locatedPositions, setLocatedPositions] = useState<Record<string, { latitude: string; longitude: string }>>({});
  const [stockForm, setStockForm] = useState<{ driver: Courier; mode: 'load' | 'replenish' | 'return' | 'loss' | 'correct'; quantity: string; reason: string; productId: string } | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const calculate = useServerFn(calculateDeliveryRoute);
  const saveMapPin = useServerFn(saveDeliveryMapPin);
  const query = useQuery({
    queryKey: ['courier-operations', day],
    enabled: canReadCourierOperations({ admin, manager, courier }),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('read_courier_operations', { p_from: day, p_to: day });
      if (error) throw new Error(error.message);
      return data as unknown as CourierOperations;
    },
    refetchInterval: 15_000,
  });
  const operations = query.data ?? { base: null, current_courier_id: null, locations: [], time_entries: [] };
  const mappedDeliveries = deliveries.map(delivery => locatedPositions[delivery.id] ? { ...delivery, address: { ...delivery.address, ...locatedPositions[delivery.id] } } : delivery);
  const activeDeliveries = mappedDeliveries.filter(delivery => !['Entregue', 'Cancelado'].includes(delivery.status));
  const availableDeliveries = activeDeliveries.filter(delivery => !delivery.route_id);
  const hasReadyToAssign = availableDeliveries.some(delivery => delivery.status === 'Pronto para entrega');
  const activeRoutes = routes.filter(item => activeDeliveries.some(delivery => delivery.route_id === item.id));
  const mapDeliveries = focus.type === 'courier' ? activeDeliveries.filter(delivery => delivery.courier_id === focus.courierId) : activeDeliveries;
  const ownCourier = couriers.find(driver => driver.id === operations.current_courier_id);
  const liveLocations = operations.locations.filter(location => !isCourierLocationStale(location.located_at));
  const returningCount = couriers.filter(driver => driver.active && driver.operational_status === 'returning').length;
  const availableCourierCount = couriers.filter(driver => driver.active && (driver.operational_status ?? 'available') === 'available').length;
  const emptyStockCount = couriers.filter(driver => driver.active && stockFor(driver, deliveries).remaining === 0).length;
  const activeCouriers = couriers.filter(driver => driver.active && !driver.deleted_at);
  const visibleCouriers = filterCouriersByAvailability(activeCouriers, showUnavailable);
  const unavailableCourierCount = activeCouriers.length - filterCouriersByAvailability(activeCouriers).length;

  useEffect(() => {
    if (!canReadCourierOperations({ admin, manager, courier })) return;
    const channel = supabase.channel(`courier-locations-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, () => { void query.refetch(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const focusMap = useCallback((type: DeliveryMapFocus['type'], courierId?: string) => {
    setFocus(current => ({ type, courierId, token: current.token + 1 }));
  }, []);
  const selectCourier = useCallback((courierId: string) => focusMap('courier', courierId), [focusMap]);
  const focusDelivery = useCallback((delivery: Delivery) => {
    setLocationDraft(current => current?.deliveryId === delivery.id ? current : null);
    setSelectedDeliveryId(delivery.id);
    setSelectedDeliveryIds([delivery.id]);
    setFocus(current => ({ type: 'delivery', deliveryId: delivery.id, token: current.token + 1 }));
  }, []);
  const focusDeliveries = useCallback((selection: Delivery[]) => {
    const valid = selection.filter(delivery => delivery.status === 'Pronto para entrega' && !delivery.route_id);
    const first = valid[0];
    setLocationDraft(null);
    setSelectedDeliveryIds(valid.map(delivery => delivery.id));
    setSelectedDeliveryId(first?.id ?? null);
    setFocus(current => first ? { type: 'delivery', deliveryId: first.id, token: current.token + 1 } : { type: 'all', token: current.token + 1 });
  }, []);
  const deliveryLocated = useCallback((delivery: Delivery, position: { latitude: number; longitude: number }) => {
    setLocatedPositions(current => ({ ...current, [delivery.id]: { latitude: String(position.latitude), longitude: String(position.longitude) } }));
  }, []);
  const changeLocationDraft = useCallback((position: { latitude: number; longitude: number }) => {
    setLocationDraft(current => current ? { ...current, ...position, touched: true } : null);
  }, []);

  function beginLocationEdit(delivery: Delivery) {
    const point = deliveryCoordinates(delivery);
    const fallback = operations.base ? { latitude: operations.base.base_latitude, longitude: operations.base.base_longitude } : null;
    if (!point && !fallback) { toast.error('Configure a base antes de corrigir o ponto no mapa.'); return; }
    focusDelivery(delivery);
    setLocationDraft({ deliveryId: delivery.id, ...(point ?? fallback!), touched: false });
  }

  async function saveLocation() {
    if (!locationDraft?.touched) return;
    const delivery = deliveries.find(item => item.id === locationDraft.deliveryId);
    if (!delivery) { toast.error('A entrega não está mais disponível.'); setLocationDraft(null); return; }
    setSavingLocation(true);
    try {
      const position = await saveMapPin({ data: { deliveryId: locationDraft.deliveryId, latitude: locationDraft.latitude, longitude: locationDraft.longitude } });
      deliveryLocated(delivery, position);
      setRoute(current => current?.stops.some(stop => stop.delivery_id === delivery.id) ? null : current);
      setLocationDraft(null);
      toast.success(`Ponto do pedido #${delivery.number} corrigido e salvo.`);
      await client.invalidateQueries({ queryKey: ['delivery-board'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o ponto.');
    } finally {
      setSavingLocation(false);
    }
  }
  const selectDelivery = useCallback((deliveryId: string) => {
    const delivery = activeDeliveries.find(item => item.id === deliveryId);
    if (delivery) focusDelivery(delivery);
  }, [activeDeliveries, focusDelivery]);

  async function showRoute() {
    if (!routeId) return;
    setRouteBusy(true);
    try {
      const result = await calculate({ data: { routeId } });
      setRoute({ ...result, routeId });
      focusMap('all');
      toast.success('Trajeto atualizado no mapa.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível calcular o trajeto.');
    } finally {
      setRouteBusy(false);
    }
  }

  async function saveStock() {
    if (!stockForm) return;
    const quantity = Number(stockForm.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) { toast.error('Informe uma quantidade inteira entre 0 e 999.'); return; }
    const product = marmitaProducts.find(item => item.id === stockForm.productId) ?? { id: stockForm.productId || 'product-marmita-completa', name: stockForm.driver.product_name || 'Marmita completa' };
    setStockBusy(true);
    try {
      const { error } = await supabase.rpc('set_courier_marmita_stock', { p_courier_id: stockForm.driver.id, p_quantity: quantity, p_mode: stockForm.mode, p_product_id: product.id, p_product_name: product.name, p_reason: stockForm.reason });
      if (error) throw new Error(error.message);
      const messages = { load: `Carga de ${quantity} marmitas registrada para ${stockForm.driver.name}.`, replenish: `Reposição de ${quantity} marmitas registrada.`, return: 'Retorno à base registrado e jornada encerrada.', loss: 'Perda justificada registrada.', correct: 'Saldo físico corrigido com justificativa.' };
      toast.success(messages[stockForm.mode]);
      setStockForm(null);
      await Promise.all([client.invalidateQueries({ queryKey: ['delivery-board'] }), client.invalidateQueries({ queryKey: ['delivery-operational-report'] })]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar o estoque.');
    } finally {
      setStockBusy(false);
    }
  }

  async function saveAvailability(courierId: string, status: 'available' | 'unavailable' | 'returning') {
    try {
      const { error } = courier
        ? await supabase.rpc('set_courier_availability', { p_status: status })
        : await supabase.rpc('set_delivery_courier_availability', { p_courier_id: courierId, p_status: status });
      if (error) throw new Error(error.message);
      toast.success(status === 'available' ? 'Entregador disponível para novas atribuições.' : status === 'returning' ? 'Retorno à base sinalizado.' : 'Entregador marcado como indisponível.');
      await Promise.all([client.invalidateQueries({ queryKey: ['delivery-board'] }), query.refetch()]);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível alterar a disponibilidade.'); }
  }

  if (!canReadCourierOperations({ admin, manager, courier })) return <section className="rounded-xl border bg-card p-4"><div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><MapPin size={20} /></div><div><h2 className="font-semibold">Rotas do Caixa</h2><p className="mt-1 text-sm text-muted-foreground">As paradas e o status Em rota estão abaixo. O mapa de GPS e o ponto da equipe ficam disponíveis no acesso do Administrador.</p></div></div></section>;

  return <section className="space-y-4 rounded-xl border bg-card p-3 sm:p-4">
    <div className="flex flex-wrap items-center gap-3">
      <div className="rounded-lg bg-primary/10 p-2 text-primary"><MapPin size={20} /></div>
      <div className="min-w-0 flex-1"><h2 className="text-xl font-bold">Operação na cidade</h2><p className="text-sm text-muted-foreground">Acompanhe as motos, toque para focar e designe sem sair da tela.</p></div>
      <div className="flex w-full items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium sm:w-auto"><span className={`size-2 rounded-full ${liveLocations.length ? 'bg-success' : 'bg-warning'}`} />{liveLocations.length ? `${liveLocations.length} motoboy(s) ao vivo` : 'Nenhum GPS ao vivo agora'}</div>
      {operations.base && <span className="w-full text-xs text-muted-foreground">Base: {operations.base.base_address}</span>}
    </div>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <div className="rounded-xl border bg-background p-3"><span className="text-[11px] text-muted-foreground">Disponíveis</span><b className="block text-xl">{availableCourierCount}</b></div>
      <div className="rounded-xl border bg-background p-3"><span className="text-[11px] text-muted-foreground">Aguardando</span><b className="block text-xl">{availableDeliveries.filter(delivery => delivery.status === 'Pronto para entrega').length}</b></div>
      <div className="rounded-xl border bg-background p-3"><span className="text-[11px] text-muted-foreground">Em andamento</span><b className="block text-xl">{activeDeliveries.filter(delivery => delivery.status === 'Em rota').length}</b></div>
      <div className="rounded-xl border bg-background p-3"><span className="text-[11px] text-muted-foreground">Voltando à base</span><b className="block text-xl">{returningCount}</b></div>
      <div className="rounded-xl border bg-background p-3"><span className="text-[11px] text-muted-foreground">Estoque zerado</span><b className={`block text-xl ${emptyStockCount ? 'text-warning' : ''}`}>{emptyStockCount}</b></div>
    </div>
    {courier && ownCourier && <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3"><span className="text-sm"><b>Minha disponibilidade</b><span className="block text-xs text-muted-foreground">Somente disponível recebe novas sugestões.</span></span><select aria-label="Minha disponibilidade" className="field w-auto" value={ownCourier.operational_status ?? 'available'} onChange={event => void saveAvailability(ownCourier.id, event.target.value as 'available' | 'unavailable' | 'returning')}><option value="available">Disponível</option><option value="unavailable">Indisponível</option><option value="returning">Voltando à base</option></select></div><CourierStockSummary driver={ownCourier} deliveries={deliveries} /></div>}
    {query.error && <p role="alert" className="text-sm text-destructive">{query.error.message}</p>}
    {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Carregando operação…</p> : <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={focus.type === 'all' ? 'default' : 'outline'} onClick={() => focusMap('all')}><Crosshair size={15} />Visão geral</Button>
        <Button size="sm" variant={focus.type === 'base' ? 'default' : 'outline'} onClick={() => focusMap('base')}><MapPin size={15} />Ir para a base</Button>
        {focus.type === 'courier' && <span className="inline-flex items-center rounded-full bg-primary/10 px-3 text-xs font-medium text-primary">Mostrando {couriers.find(driver => driver.id === focus.courierId)?.name ?? 'motoboy'} e suas entregas</span>}
        {focus.type === 'delivery' && <span className="inline-flex items-center rounded-full bg-primary/10 px-3 text-xs font-medium text-primary">Entrega #{activeDeliveries.find(delivery => delivery.id === focus.deliveryId)?.number ?? ''} em destaque</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-success" />Base</span>
        <span className="inline-flex items-center gap-1.5"><Motorbike size={16} className="text-primary" />Motoboy</span>
        <span className="inline-flex items-center gap-1.5"><PackageCheck size={14} className="text-warning" />Entrega atual</span>
        <span className="ml-auto inline-flex items-center gap-1.5"><Radio size={13} className={query.isFetching ? 'animate-pulse text-primary' : ''} />{query.isFetching ? 'Atualizando posições…' : `Atualizado às ${new Date(query.dataUpdatedAt).toLocaleTimeString('pt-BR')}`}</span>
      </div>
      <LiveDeliveryMap base={operations.base} locations={operations.locations} deliveries={mapDeliveries} couriers={courier ? couriers : visibleCouriers} route={route} focus={focus} selectedDeliveryId={selectedDeliveryId} selectedDeliveryIds={selectedDeliveryIds} editingLocation={locationDraft} savingLocation={savingLocation} onSelectCourier={selectCourier} onSelectDelivery={selectDelivery} onDeliveryPositionChange={changeLocationDraft} onSaveDeliveryPosition={() => void saveLocation()} onCancelDeliveryPosition={() => setLocationDraft(null)} />
      {canManage&&<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{visibleCouriers.map(driver=>{const location=operations.locations.find(item=>item.courier_id===driver.id);const stale=!location||isCourierLocationStale(location.located_at);return <Button key={driver.id} variant="outline" className="h-auto min-h-16 justify-start whitespace-normal text-left" onClick={()=>selectCourier(driver.id)} disabled={!location}><Motorbike className={stale?'text-warning':'text-success'} size={22}/><span className="min-w-0"><b className="block break-words">{driver.name}</b><span className="block text-xs text-muted-foreground">{location?`${stale?'Última posição, não ao vivo':'GPS ao vivo'} · ${clockTime(location.located_at)} · precisão ${Math.round(location.accuracy_meters)} m`:'GPS não compartilhado'}</span></span></Button>;})}</div>}
      {!liveLocations.length && <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">Para ver uma moto se movendo, o entregador precisa bater a entrada, ativar a localização no celular e manter a página aberta. Posições antigas aparecem em cinza.</p>}

      {canManage && <AvailableDeliveryPanel deliveries={availableDeliveries} couriers={couriers} locations={operations.locations} baseAddress={operations.base?.base_address ?? ''} selectedDeliveryId={selectedDeliveryId} selectedDeliveryIds={selectedDeliveryIds} onFocusDelivery={focusDelivery} onSelectDeliveries={focusDeliveries} onLocated={deliveryLocated} onEditLocation={beginLocationEdit} onAssign={onAssign} />}

      {canManage && <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 font-semibold"><Users size={18} /> Motoboys disponíveis</h3><p className="text-xs text-muted-foreground">Somente quem está disponível aparece para localização, carga e novas designações.</p></div>{unavailableCourierCount > 0 && <Button size="sm" variant="outline" aria-pressed={showUnavailable} onClick={() => setShowUnavailable(current => !current)}>{showUnavailable ? <EyeOff size={15} /> : <Eye size={15} />}{showUnavailable ? 'Ocultar indisponíveis' : `Mostrar indisponíveis · ${unavailableCourierCount}`}</Button>}</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleCouriers.map(driver => {
            const location = operations.locations.find(item => item.courier_id === driver.id);
            const stale = location ? isCourierLocationStale(location.located_at) : false;
            const stock = stockFor(driver, deliveries);
            const assigned = courierActiveDeliveries(deliveries, driver.id);
            const assignedMarmitas = assigned.reduce((total, delivery) => total + deliveryMarmitaQuantity(delivery), 0);
            const selected = focus.type === 'courier' && focus.courierId === driver.id;
            return <article key={driver.id} className={`space-y-3 rounded-xl border bg-background p-4 ${selected ? 'border-primary ring-1 ring-primary' : ''}`}>
              <div className="flex items-start gap-2">
                <div className={`rounded-lg p-2 ${location && !stale ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><Motorbike size={20} /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b>{driver.name}</b><span className={`rounded-full px-2 py-0.5 text-[10px] ${driver.operational_status === 'returning' ? 'bg-warning/10 text-warning' : (driver.operational_status ?? 'available') === 'available' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{driver.operational_status === 'returning' ? 'Voltando à base' : (driver.operational_status ?? 'available') === 'available' ? 'Disponível' : 'Indisponível'}</span></div><p className={`mt-1 flex items-center gap-1 text-xs ${location && !stale ? 'text-success' : 'text-muted-foreground'}`}><span className={`size-2 rounded-full ${location && !stale ? 'bg-success' : 'bg-muted-foreground'}`} />{location ? `${stale ? 'Sem atualização recente' : 'Ao vivo'} · ${clockTime(location.located_at)} · ${Math.round(location.accuracy_meters)} m` : 'Localização não compartilhada'}</p></div>
              </div>
              {stock.remaining === null ? <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Nenhuma carga registrada. Informe quantas marmitas ele levou.</div> : <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted p-2"><span className="block text-xs text-muted-foreground">Com ele</span><b className="text-lg">{stock.remaining}</b></div>
                <div className="rounded-lg bg-muted p-2"><span className="block text-xs text-muted-foreground">Reservadas</span><b className="text-lg">{stock.reserved}</b></div>
                <div className="rounded-lg bg-primary/10 p-2"><span className="block text-xs text-muted-foreground">Disponíveis</span><b className={`text-lg ${(stock.available ?? 0) < 0 ? 'text-destructive' : 'text-primary'}`}>{stock.available}</b></div>
              </div>}
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2"><b className="text-sm">Entregas com {driver.name}</b><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{assigned.length} · {assignedMarmitas} marmita(s)</span></div>
                {assigned.length ? <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">{assigned.map(delivery => {
                  const zone = deliveryZone(delivery.address);
                  return <li key={delivery.id} className="space-y-2 rounded-lg border bg-background p-2.5">
                    <button type="button" onClick={() => focusDelivery(delivery)} className="w-full text-left">
                      <span className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">#{delivery.number} · {delivery.customer}</b><span className="text-xs text-warning">{delivery.status === 'Em rota' ? 'Na rua' : delivery.status}</span></span>
                      <span className="mt-1 block text-xs font-medium text-primary">{zone?.name ?? 'Distrito a confirmar'} · {delivery.address.neighborhood || 'Bairro não informado'}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{delivery.address.street}, {delivery.address.number} · toque para ver no mapa</span>
                    </button>
                    {canCorrectDeliveryMapPin(delivery) && <Button size="sm" variant="outline" className="w-full" aria-label={`Corrigir ponto do pedido #${delivery.number}`} onClick={() => beginLocationEdit(delivery)}><Pencil size={14} />Corrigir ponto no mapa</Button>}
                  </li>;
                })}</ul> : <p className="mt-2 text-xs text-muted-foreground">Nenhuma entrega atribuída no momento.</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" disabled={!location} onClick={() => focusMap('courier', driver.id)}><LocateFixed size={14} />Localizar</Button>
                <Button size="sm" disabled={!operations.base || !hasReadyToAssign} title={hasReadyToAssign ? 'Escolher entregas prontas para este motoboy' : 'Nenhuma entrega pronta para designar agora'} onClick={() => operations.base && onAssign(driver.id, operations.base.base_address, selectedDeliveryIds)}><RouteIcon size={14} />Designar</Button>
              </div>
              <label className="block text-xs">Disponibilidade<select aria-label={`Disponibilidade de ${driver.name}`} className="field mt-1" value={driver.operational_status ?? 'available'} onChange={event => void saveAvailability(driver.id, event.target.value as 'available' | 'unavailable' | 'returning')}><option value="available">Disponível</option><option value="unavailable">Indisponível</option><option value="returning">Voltando à base</option></select></label>
              {driver.product_name && <p className="text-xs text-muted-foreground">Carga: {driver.product_name} · {driver.journey_status === 'returned' ? 'jornada devolvida' : driver.journey_status === 'empty' ? 'estoque zerado' : 'em operação'}</p>}
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button size="sm" variant="ghost" onClick={() => setStockForm({ driver, mode: 'load', quantity: '', reason: '', productId: driver.product_id ?? marmitaProducts[0]?.id ?? 'product-marmita-completa' })}><PackagePlus size={14} />Nova carga</Button>
                {stock.remaining !== null && <Button size="sm" variant="ghost" onClick={() => setStockForm({ driver, mode: 'replenish', quantity: '', reason: '', productId: driver.product_id ?? marmitaProducts[0]?.id ?? 'product-marmita-completa' })}><PackagePlus size={14} />Reposição</Button>}
                {stock.remaining !== null && <Button size="sm" variant="ghost" onClick={() => setStockForm({ driver, mode: 'return', quantity: String(stock.remaining), reason: '', productId: driver.product_id ?? '' })}>Registrar retorno</Button>}
                {stock.remaining !== null && <Button size="sm" variant="ghost" onClick={() => setStockForm({ driver, mode: 'loss', quantity: '', reason: '', productId: driver.product_id ?? '' })}>Perda/avaria</Button>}
                {stock.remaining !== null && <Button size="sm" variant="ghost" onClick={() => setStockForm({ driver, mode: 'correct', quantity: String(stock.remaining), reason: '', productId: driver.product_id ?? '' })}><Boxes size={14} />Ajustar estoque</Button>}
              </div>
            </article>;
          })}
        </div>
        {!visibleCouriers.length && <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">Nenhum motoboy disponível agora. Use “Mostrar indisponíveis” para alterar a disponibilidade da equipe.</p>}
      </div>}

      <details className="rounded-xl border bg-background p-4">
        <summary className="cursor-pointer text-sm font-semibold">Trajeto de uma rota no mapa</summary>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-56 flex-1 text-sm">Rota
            <select aria-label="Selecionar rota para o mapa" className="field mt-1" value={routeId} onChange={event => { setRouteId(event.target.value); setRoute(null); }}>
              <option value="">Selecione uma rota</option>
              {activeRoutes.map(item => <option key={item.id} value={item.id}>{item.name} · {couriers.find(driver => driver.id === item.courier_id)?.name ?? 'Sem entregador'}</option>)}
            </select>
          </label>
          <Button disabled={!routeId || routeBusy} onClick={() => void showRoute()}><Navigation size={16} />{routeBusy ? 'Calculando…' : route ? 'Recalcular trajeto' : 'Ver trajeto no mapa'}</Button>
          <span className="text-xs text-muted-foreground">Consulta ao Google somente ao clicar.</span>
        </div>
        {route && <div className="mt-3 flex flex-wrap gap-5 text-sm"><span>Distância <b>{(route.distance_meters / 1000).toFixed(1)} km</b></span><span>Duração estimada <b>{Math.ceil(route.duration_seconds / 60)} min</b></span><span className="text-muted-foreground">Sem atualização automática de trânsito</span></div>}
      </details>

      {canManage && operations.base && <DeliveryOperatingHours base={operations.base} admin={admin} />}
      {courier && <DeliveryOperationsReport courier />}

      {canManage && <details className="rounded-xl border bg-background p-4"><summary className="cursor-pointer font-semibold">Ponto e valores da equipe</summary><section className="mt-5 space-y-4 border-t pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="flex items-center gap-2 text-lg font-semibold"><Clock3 size={18} /> Ponto da equipe</h3><p className="text-sm text-muted-foreground">Entradas, saídas e valores por turno</p></div>
          <label className="text-sm">Dia<input aria-label="Dia do ponto" className="field ml-2 w-auto" type="date" value={day} onChange={event => setDay(event.target.value)} /></label>
        </div>
        <div className="flex flex-wrap gap-5 text-sm"><span>Turnos registrados: <b>{operations.time_entries.length}</b></span><span>Total registrado: <b>{brl(courierTimeTotals(operations.time_entries).registered)}</b></span><span>Turnos concluídos: <b>{brl(courierTimeTotals(operations.time_entries).completed)}</b></span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted text-left"><tr><th className="p-3">Entregador</th><th>Turno</th><th>Horário previsto</th><th>Entrada</th><th>Saída</th><th className="text-right">Valor</th></tr></thead><tbody>
          {operations.time_entries.map(entry => <tr key={entry.id} className="border-b"><td className="p-3 font-medium">{entry.courier_name}</td><td>{COURIER_SHIFTS[entry.shift_code]?.label ?? entry.shift_code}</td><td>{COURIER_SHIFTS[entry.shift_code]?.start}–{COURIER_SHIFTS[entry.shift_code]?.end}</td><td>{new Date(entry.entry_at).toLocaleString('pt-BR')}</td><td>{entry.exit_at ? new Date(entry.exit_at).toLocaleString('pt-BR') : <span className="text-warning">Turno aberto</span>}</td><td className="text-right font-semibold">{brl(entry.amount)}</td></tr>)}
        </tbody></table>{!operations.time_entries.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum ponto registrado neste dia.</p>}</div>
      </section></details>}
    </>}

    {stockForm && <div role="dialog" aria-modal="true" aria-label={`Operação de estoque de ${stockForm.driver.name}`} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/95 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-5 shadow-lg">
        <div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><PackagePlus size={20} /></div><div><h2 className="text-xl font-bold">{{ load: 'Nova carga e jornada', replenish: 'Adicionar reposição', return: 'Registrar retorno e encerrar jornada', loss: 'Registrar perda ou avaria', correct: 'Ajustar estoque físico' }[stockForm.mode]}</h2><p className="text-sm text-muted-foreground">{stockForm.driver.name}</p></div></div>
        <p className="text-sm text-muted-foreground">{{ load: 'Inicia uma jornada sem apagar o histórico. Exige que a carga anterior tenha sido devolvida ou esteja zerada.', replenish: 'Acrescenta marmitas do mesmo tipo à carga atual.', return: 'Confirme a quantidade física devolvida. Não pode haver marmitas reservadas.', loss: 'A perda baixa o estoque físico e exige justificativa.', correct: 'Informe a quantidade real e o motivo; as reservas continuam protegidas.' }[stockForm.mode]}</p>
        {(stockForm.mode === 'load' || stockForm.mode === 'replenish') && <label className="block text-sm font-medium">Tipo de marmita<select aria-label="Tipo de marmita" className="field mt-1" disabled={stockForm.mode === 'replenish'} value={stockForm.productId} onChange={event => setStockForm({ ...stockForm, productId: event.target.value })}>{(marmitaProducts.length ? marmitaProducts : [{ id: stockForm.driver.product_id || 'product-marmita-completa', name: stockForm.driver.product_name || 'Marmita completa' }]).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}
        <label className="block text-sm font-medium">{stockForm.mode === 'return' ? 'Quantidade física devolvida' : stockForm.mode === 'loss' ? 'Quantidade perdida' : 'Quantidade de marmitas'}<input autoFocus aria-label="Quantidade de marmitas" className="field mt-1 text-lg" type="number" min="0" max="999" step="1" inputMode="numeric" value={stockForm.quantity} onChange={event => setStockForm({ ...stockForm, quantity: event.target.value })} /></label>
        {stockForm.mode !== 'load' && <label className="block text-sm font-medium">Justificativa {(stockForm.mode === 'loss' || stockForm.mode === 'correct') ? '*' : '(opcional)'}<textarea aria-label="Justificativa do estoque" className="field mt-1 min-h-20" value={stockForm.reason} onChange={event => setStockForm({ ...stockForm, reason: event.target.value })} placeholder={stockForm.mode === 'return' ? 'Ex.: retorno à base para encerrar a jornada' : 'Descreva o motivo'} /></label>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={stockBusy} onClick={() => setStockForm(null)}>Cancelar</Button><Button disabled={stockBusy || stockForm.quantity === '' || ((stockForm.mode === 'loss' || stockForm.mode === 'correct') && stockForm.reason.trim().length < 3)} onClick={() => void saveStock()}>{stockBusy ? 'Salvando…' : 'Confirmar operação'}</Button></div>
      </div>
    </div>}
  </section>;
}

function CourierStockSummary({ driver, deliveries }: { driver: Courier; deliveries: Delivery[] }) {
  const stock = stockFor(driver, deliveries);
  return <div className="rounded-xl border bg-background p-4"><div className="flex items-center gap-2"><Boxes size={18} className="text-primary" /><h3 className="font-semibold">Minhas marmitas</h3></div>{stock.remaining === null ? <p className="mt-2 text-sm text-muted-foreground">A loja ainda não registrou sua carga.</p> : <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><span className="block text-xs text-muted-foreground">Comigo</span><b className="text-xl">{stock.remaining}</b></div><div><span className="block text-xs text-muted-foreground">Nas entregas</span><b className="text-xl">{stock.reserved}</b></div><div><span className="block text-xs text-muted-foreground">Livres</span><b className="text-xl text-primary">{stock.available}</b></div></div>}</div>;
}
