import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowRight, Check, Crosshair, LoaderCircle, MapPin, Navigation, Package, Search, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { addressText, deliveryCoordinates, deliveryMarmitaQuantity, type Courier, type Delivery } from '@/lib/delivery';
import { formatCourierDistance, isCourierLocationStale, rankCourierLocations, type CourierLiveLocation } from '@/lib/courier-operations';
import { locateDeliveryOnMap } from '@/lib/delivery-route.functions';

export function AvailableDeliveryPanel({ deliveries, couriers, locations, baseAddress, selectedDeliveryId, onFocusDelivery, onLocated, onAssign }: {
  deliveries: Delivery[];
  couriers: Courier[];
  locations: CourierLiveLocation[];
  baseAddress: string;
  selectedDeliveryId: string | null;
  onFocusDelivery: (delivery: Delivery) => void;
  onLocated: (delivery: Delivery, position: { latitude: number; longitude: number }) => void;
  onAssign: (courierId: string, baseAddress: string, deliveryIds?: string[]) => void;
}) {
  const client = useQueryClient();
  const locate = useServerFn(locateDeliveryOnMap);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(6);
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const filtered = deliveries.filter(delivery => `${delivery.number} ${delivery.customer} ${addressText(delivery.address)}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  const selected = deliveries.find(delivery => delivery.id === selectedDeliveryId) ?? null;
  const point = selected ? deliveryCoordinates(selected) : null;
  const ranked = useMemo(() => point ? rankCourierLocations(point, locations) : [], [point?.latitude, point?.longitude, locations]);
  const distanceByCourier = new Map(ranked.map(location => [location.courier_id, location.distanceMeters]));
  const sortedCouriers = [...couriers.filter(driver => driver.active)].sort((a, b) => {
    const locationA = locations.find(location => location.courier_id === a.id);
    const locationB = locations.find(location => location.courier_id === b.id);
    const scoreA = !locationA ? 2 : isCourierLocationStale(locationA.located_at) ? 1 : 0;
    const scoreB = !locationB ? 2 : isCourierLocationStale(locationB.located_at) ? 1 : 0;
    return scoreA - scoreB || (distanceByCourier.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (distanceByCourier.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
  });
  const nearestId = ranked.find(location => !isCourierLocationStale(location.located_at))?.courier_id ?? null;

  async function chooseDelivery(delivery: Delivery) {
    if (deliveryCoordinates(delivery)) { onFocusDelivery(delivery); return; }
    setLocatingId(delivery.id);
    try {
      const position = await locate({ data: { deliveryId: delivery.id } });
      onLocated(delivery, position);
      onFocusDelivery({ ...delivery, address: { ...delivery.address, latitude: String(position.latitude), longitude: String(position.longitude) } });
      await client.invalidateQueries({ queryKey: ['delivery-board'] });
      toast.success(`Endereço do pedido #${delivery.number} localizado e salvo.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível localizar este endereço.');
    } finally {
      setLocatingId(null);
    }
  }

  return <section className="space-y-4 rounded-xl border bg-background p-4" aria-label="Designar entrega por proximidade">
    <div className="grid gap-2 sm:grid-cols-3">
      <Step number={1} title="Escolha a entrega" active={!selected} done={Boolean(selected)} />
      <Step number={2} title="Veja quem está perto" active={Boolean(selected)} done={Boolean(selected && nearestId)} />
      <Step number={3} title="Toque em Designar" active={Boolean(selected)} />
    </div>

    <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-4">
      <div><h3 className="flex items-center gap-2 text-lg font-bold"><Package size={19} className="text-primary" />Entregas disponíveis <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{deliveries.length}</span></h3><p className="text-xs text-muted-foreground">Prontas e ainda sem rota. Toque para mostrar no mapa.</p></div>
      <label className="relative block w-full sm:w-72"><Search size={15} className="absolute left-3 top-3 text-muted-foreground" /><input aria-label="Buscar entrega disponível" className="field pl-9" placeholder="Número, cliente ou endereço" value={query} onChange={event => { setQuery(event.target.value); setLimit(6); }} /></label>
    </div>

    {!deliveries.length ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhuma entrega pronta aguardando designação.</p> : <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {filtered.slice(0, limit).map(delivery => {
        const selectedCard = delivery.id === selectedDeliveryId;
        const hasPoint = Boolean(deliveryCoordinates(delivery));
        const loading = locatingId === delivery.id;
        return <button type="button" key={delivery.id} aria-pressed={selectedCard} disabled={Boolean(locatingId)} onClick={() => void chooseDelivery(delivery)} className={`group flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary ${selectedCard ? 'border-primary shadow-glow ring-1 ring-primary' : ''}`}>
          <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${selectedCard ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>{loading ? <LoaderCircle size={18} className="animate-spin" /> : <MapPin size={18} />}</span>
          <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><b>#{delivery.number} · {delivery.customer}</b><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{deliveryMarmitaQuantity(delivery)} marmita(s)</span></span><span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{addressText(delivery.address)}</span><span className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${hasPoint ? 'text-success' : 'text-primary'}`}>{loading ? 'Localizando endereço…' : hasPoint ? <><Check size={13} />No mapa · toque para destacar</> : <><Crosshair size={13} />Toque para localizar</>}</span></span>
        </button>;
      })}
    </div>}
    {filtered.length > limit && <Button variant="ghost" size="sm" onClick={() => setLimit(current => current + 6)}>Mostrar mais entregas · restam {filtered.length - limit}</Button>}
    {!filtered.length && deliveries.length > 0 && <p className="text-sm text-muted-foreground">Nenhuma entrega encontrada nesta busca.</p>}

    {selected && <div className="space-y-4 rounded-xl border border-primary/40 bg-card p-4 pdv-item-enter">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">#{selected.number}</span><div className="min-w-0 flex-1"><h3 className="font-bold">{selected.customer}</h3><p className="text-sm text-muted-foreground">{addressText(selected.address)}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Selecionada</span></div>
      <div><h4 className="flex items-center gap-2 font-semibold"><Navigation size={17} className="text-primary" />Motoboys próximos</h4><p className="mt-1 text-xs text-muted-foreground">Distância em linha reta até o endereço, usando o GPS mais recente. Não considera trânsito.</p></div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{sortedCouriers.map(driver => {
        const location = locations.find(item => item.courier_id === driver.id);
        const stale = location ? isCourierLocationStale(location.located_at) : false;
        const distance = distanceByCourier.get(driver.id);
        const nearest = driver.id === nearestId;
        return <article key={driver.id} className={`rounded-xl border p-3 transition-all duration-300 ${nearest ? 'border-success bg-success/5 shadow-glow' : 'bg-background'}`}>
          <div className="flex items-center gap-2"><UserRound size={17} className={nearest ? 'text-success' : 'text-primary'} /><b>{driver.name}</b>{nearest && <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Mais próximo</span>}</div>
          <p className="my-2 text-sm">{location ? <><b>{distance === undefined ? '—' : formatCourierDistance(distance)}</b><span className={`ml-2 text-xs ${stale ? 'text-warning' : 'text-success'}`}>{stale ? 'GPS desatualizado' : 'GPS ao vivo'}</span></> : <span className="text-xs text-muted-foreground">Ative o GPS no celular do motoboy para calcular</span>}</p>
          <Button size="sm" className="w-full" disabled={!baseAddress} onClick={() => onAssign(driver.id, baseAddress, [selected.id])}>Designar {driver.name}<ArrowRight size={14} /></Button>
        </article>;
      })}</div>
      {!sortedCouriers.length && <p className="text-sm text-muted-foreground">Cadastre um motoboy para designar esta entrega.</p>}
    </div>}
    <p className="text-xs text-muted-foreground">Para economizar, um endereço sem ponto é consultado no Google somente quando você toca nele; a posição fica salva para as próximas vezes.</p>
  </section>;
}

function Step({ number, title, active, done = false }: { number: number; title: string; active: boolean; done?: boolean }) {
  return <div className={`flex items-center gap-2 rounded-lg border p-2 text-xs transition-colors ${active ? 'border-primary bg-primary/10' : 'bg-muted/50'}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full font-bold ${done ? 'bg-success text-primary-foreground' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{done ? <Check size={13} /> : number}</span><b>{title}</b></div>;
}
