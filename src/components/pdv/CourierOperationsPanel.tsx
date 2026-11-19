import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Boxes, Clock3, Crosshair, LocateFixed, MapPin, Navigation, PackagePlus, Radio, Route as RouteIcon, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { brl } from '@/lib/pdv-store';
import { COURIER_SHIFTS, courierTimeTotals, isCourierLocationStale, saoPauloDay, shouldSendCourierPosition, type CourierOperations, type DeliveryRouteCalculation } from '@/lib/courier-operations';
import { courierMarmitaStock as stockFor, type Courier, type Delivery, type DeliveryRoute } from '@/lib/delivery';
import { calculateDeliveryRoute } from '@/lib/delivery-route.functions';
import { LiveDeliveryMap, type DeliveryMapFocus } from './LiveDeliveryMap';

const clockTime = (value: string | null) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';

export function CourierOperationsPanel({ admin = false, courier = false, deliveries, routes, couriers, onAssign }: {
  admin?: boolean;
  courier?: boolean;
  deliveries: Delivery[];
  routes: DeliveryRoute[];
  couriers: Courier[];
  onAssign: (courierId: string, baseAddress: string) => void;
}) {
  const client = useQueryClient();
  const [day, setDay] = useState(saoPauloDay);
  const [routeId, setRouteId] = useState('');
  const [route, setRoute] = useState<(DeliveryRouteCalculation & { routeId: string }) | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [focus, setFocus] = useState<DeliveryMapFocus>({ type: 'all', token: 0 });
  const [stockForm, setStockForm] = useState<{ driver: Courier; mode: 'load' | 'correct'; quantity: string } | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const calculate = useServerFn(calculateDeliveryRoute);
  const query = useQuery({
    queryKey: ['courier-operations', day],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('read_courier_operations', { p_from: day, p_to: day });
      if (error) throw new Error(error.message);
      return data as unknown as CourierOperations;
    },
    refetchInterval: 15_000,
  });
  const operations = query.data ?? { base: null, current_courier_id: null, locations: [], time_entries: [] };
  const activeDeliveries = deliveries.filter(delivery => !['Entregue', 'Cancelado'].includes(delivery.status));
  const activeRoutes = routes.filter(item => activeDeliveries.some(delivery => delivery.route_id === item.id));
  const mapDeliveries = focus.type === 'courier' ? activeDeliveries.filter(delivery => delivery.courier_id === focus.courierId) : activeDeliveries;
  const ownCourier = couriers.find(driver => driver.id === operations.current_courier_id);

  useEffect(() => {
    const channel = supabase.channel(`courier-locations-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, () => { void query.refetch(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const focusMap = useCallback((type: DeliveryMapFocus['type'], courierId?: string) => {
    setFocus(current => ({ type, courierId, token: current.token + 1 }));
  }, []);
  const selectCourier = useCallback((courierId: string) => focusMap('courier', courierId), [focusMap]);

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
    setStockBusy(true);
    try {
      const { error } = await supabase.rpc('set_courier_marmita_stock', { p_courier_id: stockForm.driver.id, p_quantity: quantity, p_mode: stockForm.mode });
      if (error) throw new Error(error.message);
      toast.success(stockForm.mode === 'load' ? `Carga de ${quantity} marmitas registrada para ${stockForm.driver.name}.` : `Saldo de ${stockForm.driver.name} corrigido para ${quantity}.`);
      setStockForm(null);
      await client.invalidateQueries({ queryKey: ['delivery-board'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar o estoque.');
    } finally {
      setStockBusy(false);
    }
  }

  return <section className="space-y-4 rounded-xl border bg-card p-3 sm:p-4">
    <div className="flex flex-wrap items-center gap-3">
      <div className="rounded-lg bg-primary/10 p-2 text-primary"><MapPin size={20} /></div>
      <div className="min-w-0 flex-1"><h2 className="text-xl font-bold">Mapa da operação</h2><p className="text-sm text-muted-foreground">Base, motoboys e entregas em tempo real</p></div>
      {operations.base && <span className="max-w-xl text-xs text-muted-foreground">{operations.base.base_address}</span>}
    </div>

    {courier && <CourierLocationControl operations={operations} refetch={query.refetch} />}
    {courier && ownCourier && <CourierStockSummary driver={ownCourier} deliveries={deliveries} />}
    {query.error && <p role="alert" className="text-sm text-destructive">{query.error.message}</p>}
    {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Carregando operação…</p> : <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={focus.type === 'all' ? 'default' : 'outline'} onClick={() => focusMap('all')}><Crosshair size={15} />Visão geral</Button>
        <Button size="sm" variant={focus.type === 'base' ? 'default' : 'outline'} onClick={() => focusMap('base')}><MapPin size={15} />Ir para a base</Button>
        {focus.type === 'courier' && <span className="inline-flex items-center rounded-full bg-primary/10 px-3 text-xs font-medium text-primary">Mostrando {couriers.find(driver => driver.id === focus.courierId)?.name ?? 'motoboy'} e suas entregas</span>}
      </div>
      <LiveDeliveryMap base={operations.base} locations={operations.locations} deliveries={mapDeliveries} couriers={couriers} route={route} focus={focus} onSelectCourier={selectCourier} />

      {admin && <div className="space-y-3">
        <div><h3 className="flex items-center gap-2 font-semibold"><Users size={18} /> Motoboys e cargas</h3><p className="text-xs text-muted-foreground">Localize, registre a carga ou escolha quem receberá as próximas entregas.</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {couriers.filter(item => item.active).map(driver => {
            const location = operations.locations.find(item => item.courier_id === driver.id);
            const stale = location ? isCourierLocationStale(location.located_at) : false;
            const stock = stockFor(driver, deliveries);
            const selected = focus.type === 'courier' && focus.courierId === driver.id;
            return <article key={driver.id} className={`space-y-3 rounded-xl border bg-background p-4 ${selected ? 'border-primary ring-1 ring-primary' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><Radio size={17} /></div>
                <div className="min-w-0 flex-1"><b>{driver.name}</b><p className={`mt-1 flex items-center gap-1 text-xs ${location && !stale ? 'text-success' : 'text-muted-foreground'}`}><span className={`size-2 rounded-full ${location && !stale ? 'bg-success' : 'bg-muted-foreground'}`} />{location ? `${stale ? 'Sem atualização recente' : 'Ao vivo'} · ${clockTime(location.located_at)} · ${Math.round(location.accuracy_meters)} m` : 'Localização não compartilhada'}</p></div>
              </div>
              {stock.remaining === null ? <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Nenhuma carga registrada. Informe quantas marmitas ele levou.</div> : <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted p-2"><span className="block text-xs text-muted-foreground">Com ele</span><b className="text-lg">{stock.remaining}</b></div>
                <div className="rounded-lg bg-muted p-2"><span className="block text-xs text-muted-foreground">Reservadas</span><b className="text-lg">{stock.reserved}</b></div>
                <div className="rounded-lg bg-primary/10 p-2"><span className="block text-xs text-muted-foreground">Disponíveis</span><b className={`text-lg ${(stock.available ?? 0) < 0 ? 'text-destructive' : 'text-primary'}`}>{stock.available}</b></div>
              </div>}
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" disabled={!location} onClick={() => focusMap('courier', driver.id)}><LocateFixed size={14} />Localizar</Button>
                <Button size="sm" disabled={!operations.base} onClick={() => operations.base && onAssign(driver.id, operations.base.base_address)}><RouteIcon size={14} />Designar</Button>
              </div>
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button size="sm" variant="ghost" onClick={() => setStockForm({ driver, mode: 'load', quantity: '' })}><PackagePlus size={14} />Nova carga</Button>
                {stock.remaining !== null && <Button size="sm" variant="ghost" onClick={() => setStockForm({ driver, mode: 'correct', quantity: String(stock.remaining) })}><Boxes size={14} />Corrigir saldo</Button>}
              </div>
            </article>;
          })}
        </div>
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

      {admin && <details className="rounded-xl border bg-background p-4"><summary className="cursor-pointer font-semibold">Ponto e valores da equipe</summary><section className="mt-5 space-y-4 border-t pt-5">
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

    {stockForm && <div role="dialog" aria-modal="true" aria-label={`${stockForm.mode === 'load' ? 'Nova carga' : 'Corrigir saldo'} de ${stockForm.driver.name}`} className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-5 shadow-lg">
        <div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><PackagePlus size={20} /></div><div><h2 className="text-xl font-bold">{stockForm.mode === 'load' ? 'Nova carga de saída' : 'Corrigir saldo físico'}</h2><p className="text-sm text-muted-foreground">{stockForm.driver.name}</p></div></div>
        <p className="text-sm text-muted-foreground">{stockForm.mode === 'load' ? 'Use no início de uma saída, quando não houver marmitas reservadas em entregas abertas.' : 'Informe a quantidade real que está com o motoboy agora. As reservas das entregas abertas continuam separadas.'}</p>
        <label className="block text-sm font-medium">Quantidade de marmitas<input autoFocus aria-label="Quantidade de marmitas" className="field mt-1 text-lg" type="number" min="0" max="999" step="1" inputMode="numeric" value={stockForm.quantity} onChange={event => setStockForm({ ...stockForm, quantity: event.target.value })} /></label>
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={stockBusy} onClick={() => setStockForm(null)}>Cancelar</Button><Button disabled={stockBusy || stockForm.quantity === ''} onClick={() => void saveStock()}>{stockBusy ? 'Salvando…' : stockForm.mode === 'load' ? 'Registrar carga' : 'Salvar correção'}</Button></div>
      </div>
    </div>}
  </section>;
}

function CourierStockSummary({ driver, deliveries }: { driver: Courier; deliveries: Delivery[] }) {
  const stock = stockFor(driver, deliveries);
  return <div className="rounded-xl border bg-background p-4"><div className="flex items-center gap-2"><Boxes size={18} className="text-primary" /><h3 className="font-semibold">Minhas marmitas</h3></div>{stock.remaining === null ? <p className="mt-2 text-sm text-muted-foreground">A loja ainda não registrou sua carga.</p> : <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><span className="block text-xs text-muted-foreground">Comigo</span><b className="text-xl">{stock.remaining}</b></div><div><span className="block text-xs text-muted-foreground">Nas entregas</span><b className="text-xl">{stock.reserved}</b></div><div><span className="block text-xs text-muted-foreground">Livres</span><b className="text-xl text-primary">{stock.available}</b></div></div>}</div>;
}

function CourierLocationControl({ operations, refetch }: { operations: CourierOperations; refetch: () => Promise<unknown> }) {
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState('');
  const lastSent = useRef<{ latitude: number; longitude: number; sentAt: number } | null>(null);
  const hasOpenShift = operations.time_entries.some(entry => entry.exit_at === null);
  const ownLocation = operations.locations.find(location => location.courier_id === operations.current_courier_id);

  useEffect(() => { const active = operations.locations.length > 0; setSharing(active); if (!active) setStatus('Compartilhamento desativado.'); }, [operations.locations.length]);
  useEffect(() => {
    if (!sharing || !hasOpenShift || !navigator.geolocation) return;
    let cancelled = false;
    const watch = navigator.geolocation.watchPosition(position => {
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const now = Date.now();
      if (!shouldSendCourierPosition(lastSent.current, next, now)) return;
      lastSent.current = { ...next, sentAt: now };
      void supabase.rpc('update_courier_location', { p_latitude: next.latitude, p_longitude: next.longitude, p_accuracy: position.coords.accuracy }).then(({ error }) => {
        if (cancelled) return;
        if (error) setStatus(error.message);
        else { setStatus('Localização compartilhada com o administrador.'); void refetch(); }
      });
    }, error => {
      setStatus(error.code === error.PERMISSION_DENIED ? 'Permita o acesso à localização no celular para aparecer no mapa.' : error.message);
      if (error.code === error.PERMISSION_DENIED) setSharing(false);
    }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 });
    return () => { cancelled = true; navigator.geolocation.clearWatch(watch); };
  }, [sharing, hasOpenShift, refetch]);

  async function toggle() {
    if (sharing) {
      const { error } = await supabase.rpc('disable_courier_location');
      if (error) { setStatus(error.message); return; }
      setSharing(false);
      setStatus('Compartilhamento desativado.');
      await refetch();
      return;
    }
    if (!hasOpenShift) { setStatus('Registre a entrada do turno antes de ativar a localização.'); return; }
    if (!navigator.geolocation) { setStatus('Este celular não oferece suporte à localização.'); return; }
    lastSent.current = null;
    setSharing(true);
    setStatus('Solicitando permissão de localização…');
  }

  return <div className="rounded-xl border bg-background p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 font-semibold"><LocateFixed size={18} /> Minha localização</h3><p className="mt-1 text-xs text-muted-foreground">Durante o turno, o administrador verá sua posição. Você pode desativar a qualquer momento.</p></div>
      <Button variant={sharing ? 'destructive' : 'default'} onClick={() => void toggle()}>{sharing ? 'Desativar localização' : 'Ativar localização'}</Button>
    </div>
    {(status || ownLocation) && <p role="status" className="mt-3 text-sm text-muted-foreground">{ownLocation ? `Última posição ${new Date(ownLocation.located_at).toLocaleTimeString('pt-BR')} · ` : ''}{status}</p>}
    <p className="mt-2 text-xs text-warning">Mantenha esta página aberta: o navegador pode pausar o GPS com o aplicativo minimizado ou a tela bloqueada.</p>
  </div>;
}
