import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Clock3, LocateFixed, MapPin, Navigation, Radio, Route as RouteIcon, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { brl } from '@/lib/pdv-store';
import { COURIER_SHIFTS, courierTimeTotals, isCourierLocationStale, saoPauloDay, shouldSendCourierPosition, type CourierOperations, type DeliveryRouteCalculation } from '@/lib/courier-operations';
import type { Courier, Delivery, DeliveryRoute } from '@/lib/delivery';
import { calculateDeliveryRoute } from '@/lib/delivery-route.functions';
import { LiveDeliveryMap } from './LiveDeliveryMap';

const clockTime = (value: string | null) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';

export function CourierOperationsPanel({ admin = false, courier = false, deliveries, routes, couriers, onAssign }: {
  admin?: boolean;
  courier?: boolean;
  deliveries: Delivery[];
  routes: DeliveryRoute[];
  couriers: Courier[];
  onAssign: (courierId: string, baseAddress: string) => void;
}) {
  const [day, setDay] = useState(saoPauloDay);
  const [routeId, setRouteId] = useState('');
  const [route, setRoute] = useState<(DeliveryRouteCalculation & { routeId: string }) | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
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

  useEffect(() => {
    const channel = supabase.channel(`courier-locations-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, () => { void query.refetch(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  async function showRoute() {
    if (!routeId) return;
    setRouteBusy(true);
    try {
      const result = await calculate({ data: { routeId } });
      setRoute({ ...result, routeId });
      toast.success('Trajeto atualizado no mapa.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível calcular o trajeto.');
    } finally {
      setRouteBusy(false);
    }
  }

  return <section className="space-y-5 rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center gap-3">
      <MapPin className="text-primary" />
      <div><h2 className="text-xl font-bold">Mapa da operação</h2><p className="text-sm text-muted-foreground">Base e posições reais durante o turno</p></div>
      {operations.base && <span className="ml-auto max-w-xl text-right text-xs text-muted-foreground">Base: {operations.base.base_address}</span>}
    </div>

    {courier && <CourierLocationControl operations={operations} refetch={query.refetch} />}
    {query.error && <p role="alert" className="text-sm text-destructive">{query.error.message}</p>}
    {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Carregando operação…</p> : <>
      <LiveDeliveryMap base={operations.base} locations={operations.locations} deliveries={activeDeliveries} route={route} />
      <div className="flex flex-wrap items-end gap-2 border-y py-4">
        <label className="min-w-56 flex-1 text-sm">Trajeto da rota
          <select aria-label="Selecionar rota para o mapa" className="field mt-1" value={routeId} onChange={event => { setRouteId(event.target.value); setRoute(null); }}>
            <option value="">Selecione uma rota</option>
            {activeRoutes.map(item => <option key={item.id} value={item.id}>{item.name} · {couriers.find(driver => driver.id === item.courier_id)?.name ?? 'Sem entregador'}</option>)}
          </select>
        </label>
        <Button disabled={!routeId || routeBusy} onClick={() => void showRoute()}><Navigation size={16} />{routeBusy ? 'Calculando…' : route ? 'Recalcular trajeto' : 'Ver trajeto no mapa'}</Button>
        <span className="text-xs text-muted-foreground">O cálculo só acontece ao clicar, nunca a cada movimento.</span>
      </div>
      {route && <div className="flex flex-wrap gap-5 text-sm"><span>Distância <b>{(route.distance_meters / 1000).toFixed(1)} km</b></span><span>Duração estimada <b>{Math.ceil(route.duration_seconds / 60)} min</b></span><span className="text-muted-foreground">Sem atualização automática de trânsito</span></div>}

      {admin && <div className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold"><Users size={18} /> Entregadores em tempo real</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {couriers.filter(item => item.active).map(driver => {
            const location = operations.locations.find(item => item.courier_id === driver.id);
            const stale = location ? isCourierLocationStale(location.located_at) : false;
            return <article key={driver.id} className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2"><Radio size={16} className={location && !stale ? 'text-success' : 'text-muted-foreground'} /><b>{driver.name}</b></div>
              <p className="my-2 text-xs text-muted-foreground">{location ? `${stale ? 'Sem atualização recente' : 'Ao vivo'} · ${new Date(location.located_at).toLocaleTimeString('pt-BR')} · precisão ${Math.round(location.accuracy_meters)} m` : 'Localização não compartilhada ou turno encerrado'}</p>
              <Button size="sm" variant="outline" disabled={!operations.base} onClick={() => operations.base && onAssign(driver.id, operations.base.base_address)}><RouteIcon size={14} /> Designar entregas</Button>
            </article>;
          })}
        </div>
      </div>}

      {admin && <details className="rounded-lg border bg-background p-4"><summary className="cursor-pointer font-semibold">Ponto e valores da equipe</summary><section className="mt-5 space-y-4 border-t pt-5">
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
  </section>;
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

  return <div className="rounded-lg border bg-background p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 font-semibold"><LocateFixed size={18} /> Minha localização</h3><p className="mt-1 text-xs text-muted-foreground">Durante o turno, o administrador verá sua posição. Você pode desativar a qualquer momento.</p></div>
      <Button variant={sharing ? 'destructive' : 'default'} onClick={() => void toggle()}>{sharing ? 'Desativar localização' : 'Ativar localização'}</Button>
    </div>
    {(status || ownLocation) && <p role="status" className="mt-3 text-sm text-muted-foreground">{ownLocation ? `Última posição ${new Date(ownLocation.located_at).toLocaleTimeString('pt-BR')} · ` : ''}{status}</p>}
    <p className="mt-2 text-xs text-warning">Mantenha esta página aberta: o navegador pode pausar o GPS com o aplicativo minimizado ou a tela bloqueada.</p>
  </div>;
}
