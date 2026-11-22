import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowRight, Check, Crosshair, Layers3, LoaderCircle, MapPin, Navigation, Package, Pencil, Search, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { addressText, deliveryCoordinates, deliveryMarmitaQuantity, type Courier, type Delivery } from '@/lib/delivery';
import { formatCourierDistance, isCourierLocationStale, rankCourierLocations, type CourierLiveLocation } from '@/lib/courier-operations';
import { groupDeliveriesByNeighborhood, rankDispatchCouriers, type CourierLocationQuality, type DeliveryNeighborhoodGroup } from '@/lib/delivery-dispatch';
import { estimateCourierDelivery, locateDeliveryOnMap } from '@/lib/delivery-route.functions';

export function AvailableDeliveryPanel({ deliveries, couriers, locations, baseAddress, selectedDeliveryId, selectedDeliveryIds, onFocusDelivery, onSelectDeliveries, onLocated, onEditLocation, onAssign }: {
  deliveries: Delivery[];
  couriers: Courier[];
  locations: CourierLiveLocation[];
  baseAddress: string;
  selectedDeliveryId: string | null;
  selectedDeliveryIds?: string[];
  onFocusDelivery: (delivery: Delivery) => void;
  onSelectDeliveries?: (deliveries: Delivery[]) => void;
  onLocated: (delivery: Delivery, position: { latitude: number; longitude: number }) => void;
  onEditLocation?: (delivery: Delivery) => void;
  onAssign: (courierId: string, baseAddress: string, deliveryIds?: string[]) => void;
}) {
  const client = useQueryClient();
  const locate = useServerFn(locateDeliveryOnMap);
  const estimate = useServerFn(estimateCourierDelivery);
  const [estimateResults, setEstimateResults] = useState<{ deliveryId: string; values: Record<string, { distanceMeters?: number; durationSeconds?: number; error?: string }> } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(6);
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const filtered = deliveries.filter(delivery => `${delivery.number} ${delivery.customer} ${addressText(delivery.address)}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  const groups = useMemo(() => groupDeliveriesByNeighborhood(deliveries), [deliveries]);
  const selectedIds = selectedDeliveryIds ?? (selectedDeliveryId ? [selectedDeliveryId] : []);
  const selectedDeliveries = selectedIds.map(id => deliveries.find(delivery => delivery.id === id)).filter((delivery): delivery is Delivery => Boolean(delivery && delivery.status === 'Pronto para entrega' && !delivery.route_id));
  const selected = deliveries.find(delivery => delivery.id === selectedDeliveryId) ?? selectedDeliveries[0] ?? null;
  const selectionReady = selectedDeliveries.length > 0;
  const hasAvailableDeliveries = deliveries.some(delivery => delivery.status === 'Pronto para entrega');
  const point = selectedDeliveries.length === 1 ? deliveryCoordinates(selectedDeliveries[0]!) : null;
  const ranked = point ? rankCourierLocations(point, locations) : [];
  const distanceByCourier = new Map(ranked.map(location => [location.courier_id, location.distanceMeters]));
  const estimates = estimateResults && selectedDeliveries.length === 1 && estimateResults.deliveryId === selectedDeliveries[0]?.id ? estimateResults.values : {};
  Object.entries(estimates).forEach(([courierId, value]) => { if (value.distanceMeters) distanceByCourier.set(courierId, value.distanceMeters); });
  const locationQuality = new Map<string, CourierLocationQuality>(couriers.map(courier => {
    const location = locations.find(item => item.courier_id === courier.id);
    return [courier.id, !location ? 'missing' : isCourierLocationStale(location.located_at) ? 'stale' : 'live'];
  }));
  const candidates = selectionReady ? rankDispatchCouriers(couriers, deliveries, selectedDeliveries, distanceByCourier, locationQuality) : [];
  const candidateByCourier = new Map(candidates.map(candidate => [candidate.courier.id, candidate]));
  const sortedCouriers = candidates.map(candidate => candidate.courier);
  const nearestId = selectedDeliveries.length === 1 ? candidates.find(candidate => locationQuality.get(candidate.courier.id) === 'live')?.courier.id ?? null : null;
  const recommendedId = selectedDeliveries.length > 1 ? candidates[0]?.courier.id ?? null : nearestId;
  const excludedCount = selectionReady ? couriers.filter(courier => courier.active).length - candidates.length : 0;

  async function calculateEstimates() {
    if (selectedDeliveries.length !== 1) return;
    const selectedDelivery = selectedDeliveries[0]!;
    const courierIds = candidates.filter(candidate => locationQuality.get(candidate.courier.id) === 'live').slice(0, 5).map(candidate => candidate.courier.id);
    if (!courierIds.length) { toast.info('Nenhum motoboy recomendado está com GPS ao vivo.'); return; }
    setEstimating(true);
    try {
      const values = await estimate({ data: { deliveryId: selectedDelivery.id, courierIds } });
      setEstimateResults({ deliveryId: selectedDelivery.id, values: Object.fromEntries(values.map(value => [value.courierId, value])) });
      if (values.every(value => value.error)) toast.error('O Google não conseguiu calcular os trajetos.');
      else toast.success('Distâncias e tempos reais atualizados para a recomendação.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível calcular os tempos reais.'); }
    finally { setEstimating(false); }
  }

  async function chooseDelivery(delivery: Delivery) {
    onSelectDeliveries?.([]);
    if (deliveryCoordinates(delivery)) { onFocusDelivery(delivery); return; }
    setLocatingId(delivery.id);
    try {
      const position = await locate({ data: { deliveryId: delivery.id } });
      onLocated(delivery, position);
      onFocusDelivery({ ...delivery, address: { ...delivery.address, latitude: String(position.latitude), longitude: String(position.longitude) } });
      await client.invalidateQueries({ queryKey: ['delivery-board'] });
      toast.success(`Endereço do pedido #${delivery.number} localizado e salvo.`);
    } catch (error) {
      onFocusDelivery(delivery);
      toast.error(error instanceof Error ? error.message : 'Não foi possível localizar este endereço. Você ainda pode designar a entrega sem o mapa.');
    } finally {
      setLocatingId(null);
    }
  }

  function chooseGroup(group: DeliveryNeighborhoodGroup) {
    const alreadySelected = group.deliveries.length === selectedDeliveries.length && group.deliveries.every(delivery => selectedIds.includes(delivery.id));
    if (alreadySelected) { onSelectDeliveries?.([]); return; }
    if (onSelectDeliveries) onSelectDeliveries(group.deliveries);
    else if (group.deliveries[0]) onFocusDelivery(group.deliveries[0]);
  }

  function assign(courierId: string) {
    onAssign(courierId, baseAddress, selectedDeliveries.map(delivery => delivery.id));
  }

  return <section className="space-y-4 rounded-xl border bg-background p-4" aria-label="Saídas atuais e designação por proximidade">
    {hasAvailableDeliveries && (!selected || selectionReady) ? <div className="grid gap-2 sm:grid-cols-3">
      <Step number={1} title="Escolha saída ou bairro" active={!selectionReady} done={selectionReady} />
      <Step number={2} title="Compare os motoboys" active={selectionReady} done={Boolean(recommendedId)} />
      <Step number={3} title="Revise e designe" active={selectionReady} />
    </div> : <p className="rounded-lg bg-primary/10 p-3 text-sm text-primary"><b>{selected && !selectionReady ? 'Entrega já na rua.' : 'Saídas em andamento.'}</b> Toque em um endereço para localizar no mapa; entregas na rua não serão designadas novamente.</p>}

    {groups.length > 0 && <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 font-semibold"><Layers3 size={17} className="text-primary" />Selecionar por bairro</h3><p className="text-xs text-muted-foreground">Reúna entregas próximas e designe tudo em uma única revisão.</p></div>{selectedDeliveries.length > 1 && <Button size="sm" variant="ghost" onClick={() => onSelectDeliveries?.([])}><X size={14} />Limpar grupo</Button>}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">{groups.map(group => {
        const active = group.deliveries.length === selectedDeliveries.length && group.deliveries.every(delivery => selectedIds.includes(delivery.id));
        return <button type="button" key={group.id} aria-pressed={active} onClick={() => chooseGroup(group)} className={`min-w-40 shrink-0 rounded-xl border p-3 text-left transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary'}`}>
          <span className="flex items-center justify-between gap-2"><b className="truncate">{group.name}</b><span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-primary-foreground/15' : 'bg-primary/10 text-primary'}`}>{group.deliveries.length}</span></span>
          <span className={`mt-1 block text-xs ${active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{active ? 'Grupo selecionado' : 'Selecionar grupo'}</span>
        </button>;
      })}</div>
    </div>}

    <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-4">
      <div><h3 className="flex items-center gap-2 text-lg font-bold"><Package size={19} className="text-primary" />Saídas atuais sem rota <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{deliveries.length}</span></h3><p className="text-xs text-muted-foreground">Toque em uma saída para localizar; use os bairros acima para selecionar várias.</p></div>
      <label className="relative block w-full sm:w-72"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" /><input aria-label="Buscar saída atual" className="field pl-9" placeholder="Número, cliente ou endereço" value={query} onChange={event => { setQuery(event.target.value); setLimit(6); }} /></label>
    </div>

    {!deliveries.length ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhuma saída atual aguardando rota.</p> : <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {filtered.slice(0, limit).map(delivery => {
        const selectedCard = selectedIds.includes(delivery.id);
        const hasPoint = Boolean(deliveryCoordinates(delivery));
        const loading = locatingId === delivery.id;
        return <button type="button" key={delivery.id} aria-pressed={selectedCard} disabled={Boolean(locatingId)} onClick={() => void chooseDelivery(delivery)} className={`group flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary ${selectedCard ? 'border-primary shadow-glow ring-1 ring-primary' : ''}`}>
          <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${selectedCard ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>{loading ? <LoaderCircle size={18} className="animate-spin" /> : <MapPin size={18} />}</span>
          <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><b>#{delivery.number} · {delivery.customer}</b><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{deliveryMarmitaQuantity(delivery)} marmita(s) · {delivery.status === 'Em rota' ? 'Na rua' : 'Pronta'}</span></span><span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{addressText(delivery.address)}</span><span className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${hasPoint ? 'text-success' : 'text-primary'}`}>{loading ? 'Localizando endereço…' : hasPoint ? <><Check size={13} />No mapa · toque para destacar</> : <><Crosshair size={13} />Toque para localizar</>}</span></span>
        </button>;
      })}
    </div>}
    {filtered.length > limit && <Button variant="ghost" size="sm" onClick={() => setLimit(current => current + 6)}>Mostrar mais saídas · restam {filtered.length - limit}</Button>}
    {!filtered.length && deliveries.length > 0 && <p className="text-sm text-muted-foreground">Nenhuma entrega encontrada nesta busca.</p>}

    {selectionReady && selected && <div className="space-y-4 rounded-xl border border-primary/40 bg-card p-4 pdv-item-enter">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">#{selected.number}</span><div className="min-w-0 flex-1"><h3 className="font-bold">{selectedDeliveries.length > 1 ? `${selectedDeliveries.length} entregas selecionadas` : selected.customer}</h3><p className="text-sm text-muted-foreground">{selectedDeliveries.length > 1 ? selectedDeliveries.map(delivery => `#${delivery.number}`).join(' · ') : addressText(selected.address)}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{selectedDeliveries.length > 1 ? 'Grupo' : 'Selecionada'}</span></div>
      {selectedDeliveries.length === 1 && onEditLocation && <Button size="sm" variant="outline" onClick={() => onEditLocation(selectedDeliveries[0]!)}><Pencil size={14} />Corrigir ponto no mapa</Button>}
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="flex items-center gap-2 font-semibold"><Navigation size={17} className="text-primary" />Motoboys recomendados</h4><p className="mt-1 text-xs text-muted-foreground">{selectedDeliveries.length > 1 ? 'Considera estoque para o grupo, disponibilidade e encaixe na rota. Sem chamadas automáticas ao Google.' : 'Combina GPS, estoque compatível, entregas pendentes e encaixe na rota. A decisão final é sempre sua.'}</p></div>{selectedDeliveries.length === 1 && <Button size="sm" variant="outline" disabled={estimating || !candidates.some(candidate => locationQuality.get(candidate.courier.id) === 'live')} onClick={() => void calculateEstimates()}>{estimating ? <LoaderCircle size={14} className="animate-spin" /> : <Navigation size={14} />}{estimating ? 'Calculando…' : 'Calcular tempo real'}</Button>}</div>
      {selectedDeliveries.length > 1 && sortedCouriers[0] && <Button className="w-full" disabled={!baseAddress} onClick={() => assign(sortedCouriers[0]!.id)}><Navigation size={16} />Designar {selectedDeliveries.length} entregas para {sortedCouriers[0]!.name}<ArrowRight size={15} /></Button>}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{sortedCouriers.map(driver => {
        const location = locations.find(item => item.courier_id === driver.id);
        const stale = location ? isCourierLocationStale(location.located_at) : false;
        const distance = distanceByCourier.get(driver.id);
        const recommended = driver.id === recommendedId;
        const candidate = candidateByCourier.get(driver.id);
        const realEstimate = estimates[driver.id];
        return <article key={driver.id} className={`rounded-xl border p-3 transition-all duration-300 ${recommended ? 'border-success bg-success/5 shadow-glow' : 'bg-background'}`}>
          <div className="flex items-center gap-2"><UserRound size={17} className={recommended ? 'text-success' : 'text-primary'} /><b>{driver.name}</b>{recommended && <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">{selectedDeliveries.length > 1 ? 'Melhor encaixe' : 'Recomendado'}</span>}</div>
          <p className="my-2 text-sm">{location ? <><b>{distance === undefined ? '—' : formatCourierDistance(distance)}{realEstimate?.durationSeconds ? ` · ${Math.ceil(realEstimate.durationSeconds / 60)} min` : ''}</b><span className={`ml-2 text-xs ${stale ? 'text-warning' : 'text-success'}`}>{realEstimate?.durationSeconds ? 'por vias' : stale ? 'GPS desatualizado' : selectedDeliveries.length > 1 ? 'GPS ao vivo' : 'linha reta · GPS ao vivo'}</span>{realEstimate?.error && <span className="block text-xs text-warning">{realEstimate.error}</span>}</> : <span className="text-xs text-muted-foreground">Sem GPS: distância não calculada</span>}</p>
          <p className="mb-2 text-xs text-muted-foreground">{driver.available_quantity ?? 0} marmita(s) livres · {candidate?.pending ?? 0} pendente(s){candidate?.fitsExistingRoute ? ' · encaixa na rota atual' : ''}</p>
          <Button size="sm" variant={selectedDeliveries.length > 1 && recommended ? 'outline' : 'default'} className="w-full" disabled={!baseAddress} onClick={() => assign(driver.id)}>{selectedDeliveries.length > 1 ? `Designar grupo para ${driver.name}` : `Designar ${driver.name}`}<ArrowRight size={14} /></Button>
        </article>;
      })}</div>
      {!sortedCouriers.length && <p role="status" className="rounded-lg bg-warning/10 p-3 text-sm text-warning">Nenhum motoboy disponível com estoque compatível para {selectedDeliveries.length > 1 ? 'esta seleção' : 'esta entrega'}.</p>}
      {excludedCount > 0 && sortedCouriers.length > 0 && <p className="text-xs text-muted-foreground">{excludedCount} entregador(es) não recomendado(s) por disponibilidade, estoque ou tipo de marmita.</p>}
    </div>}
    <p className="text-xs text-muted-foreground">A localização automática é consultada somente ao tocar em uma saída. Selecionar bairro e corrigir o ponto manualmente não faz consultas pagas ao Google.</p>
  </section>;
}

function Step({ number, title, active, done = false }: { number: number; title: string; active: boolean; done?: boolean }) {
  return <div className={`flex items-center gap-2 rounded-lg border p-2 text-xs transition-colors ${active ? 'border-primary bg-primary/10' : 'bg-muted/50'}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full font-bold ${done ? 'bg-success text-primary-foreground' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{done ? <Check size={13} /> : number}</span><b>{title}</b></div>;
}
