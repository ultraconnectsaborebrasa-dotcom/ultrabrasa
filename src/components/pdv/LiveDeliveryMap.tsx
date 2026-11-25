import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, MapPinned, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deliveryCoordinates, deliveryMarmitaQuantity, type Courier, type Delivery } from '@/lib/delivery';
import { decodeRoutePolyline, isCourierLocationStale, type CourierLiveLocation, type DeliveryBase, type DeliveryRouteCalculation } from '@/lib/courier-operations';

type GoogleApi = any;
type MapMarker = { setMap: (map: unknown) => void };
export type DeliveryMapFocus = { type: 'all' | 'base' | 'courier' | 'delivery'; courierId?: string | undefined; deliveryId?: string | undefined; token: number };
export type DeliveryLocationDraft = { deliveryId: string; latitude: number; longitude: number; touched: boolean };
let mapsLoader: Promise<GoogleApi> | null = null;

function loadGoogleMaps(): Promise<GoogleApi> {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (mapsLoader) return mapsLoader;
  const key = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'];
  const channel = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID'];
  if (!key) return Promise.reject(new Error('A chave pública do Google Maps ainda não está configurada.'));
  mapsLoader = new Promise<GoogleApi>((resolve, reject) => {
    window.__ultrabrasaMapsReady = () => { if (window.google?.maps) resolve(window.google); else reject(new Error('O mapa não pôde ser iniciado.')); };
    window.gm_authFailure = () => reject(new Error('O Google Maps não autorizou este endereço. Configure uma chave própria para o domínio da loja.'));
    const script = document.createElement('script');
    const params = new URLSearchParams({ key, loading: 'async', callback: '__ultrabrasaMapsReady', language: 'pt-BR', region: 'BR' });
    if (channel) params.set('channel', channel);
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => reject(new Error('Não foi possível carregar o Google Maps. Verifique a conexão e a chave.'));
    document.head.appendChild(script);
  });
  return mapsLoader;
}

const tokenColor = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

function markerIcon(api: GoogleApi, kind: 'base' | 'courier', color: string, selected: boolean) {
  const foreground = tokenColor('primary-foreground');
  const drawing = kind === 'courier'
    ? `<g fill="none" stroke="${foreground}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="39" r="7"/><circle cx="46" cy="39" r="7"/><path d="M17 39l8-17h9l12 17M25 22l7 17h14M27 17h9M34 22l-4-8M40 17h7"/></g>`
    : `<g fill="none" stroke="${foreground}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 29l17-13 17 13v21H15z"/><path d="M24 50V35h16v15M11 29h42"/></g>`;
  const size = selected ? 58 : 50;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="${tokenColor(color)}" stroke="${tokenColor(selected ? 'warning' : 'background')}" stroke-width="${selected ? 5 : 3}"/>${drawing}</svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new api.maps.Size(size, size), anchor: new api.maps.Point(size / 2, size / 2), labelOrigin: new api.maps.Point(32, 72) };
}

export function LiveDeliveryMap({ base, locations, deliveries, couriers, route, focus, selectedDeliveryId, selectedDeliveryIds, editingLocation = null, savingLocation = false, onSelectCourier, onSelectDelivery, onDeliveryPositionChange, onSaveDeliveryPosition, onCancelDeliveryPosition }: {
  base: DeliveryBase | null;
  locations: CourierLiveLocation[];
  deliveries: Delivery[];
  couriers: Courier[];
  route: (DeliveryRouteCalculation & { routeId: string }) | null;
  focus?: DeliveryMapFocus | null;
  selectedDeliveryId?: string | null;
  selectedDeliveryIds?: string[];
  editingLocation?: DeliveryLocationDraft | null;
  savingLocation?: boolean;
  onSelectCourier?: (courierId: string) => void;
  onSelectDelivery?: (deliveryId: string) => void;
  onDeliveryPositionChange?: (position: { latitude: number; longitude: number }) => void;
  onSaveDeliveryPosition?: () => void;
  onCancelDeliveryPosition?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleApi>(null);
  const markers = useRef<MapMarker[]>([]);
  const line = useRef<GoogleApi>(null);
  const fitted = useRef('');
  const lastFocus = useRef(0);
  const editingCentered = useRef('');
  const [api, setApi] = useState<GoogleApi>(null);
  const [error, setError] = useState('');
  const editingDelivery = editingLocation ? deliveries.find(delivery => delivery.id === editingLocation.deliveryId) : undefined;

  useEffect(() => {
    let active = true;
    if (!base || !container.current) return;
    void loadGoogleMaps().then(google => {
      if (!active || !container.current) return;
      window.gm_authFailure = () => { if (active) setError('O Google Maps não autorizou este endereço. Configure uma chave própria para o domínio da loja.'); };
      map.current = new google.maps.Map(container.current, {
        center: { lat: base.base_latitude, lng: base.base_longitude }, zoom: 14, clickableIcons: false,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true, zoomControl: true,
        gestureHandling: 'cooperative',
      });
      setApi(google);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o mapa.'); });
    return () => { active = false; };
  }, [base?.id, base?.base_latitude, base?.base_longitude]);

  useEffect(() => {
    if (!api || !map.current || !editingLocation) return;
    map.current.setOptions({ draggableCursor: 'crosshair' });
    const listener = map.current.addListener('click', (event: GoogleApi) => {
      const latitude = event.latLng?.lat();
      const longitude = event.latLng?.lng();
      if (typeof latitude === 'number' && typeof longitude === 'number') onDeliveryPositionChange?.({ latitude, longitude });
    });
    return () => { api.maps.event.removeListener(listener); map.current?.setOptions({ draggableCursor: null }); };
  }, [api, editingLocation?.deliveryId, onDeliveryPositionChange]);

  useEffect(() => {
    if (!api || !map.current || !base) return;
    markers.current.forEach(marker => marker.setMap(null));
    markers.current = [];
    if (line.current) line.current.setMap(null);
    const bounds = new api.maps.LatLngBounds();
    const info = new api.maps.InfoWindow();
    const addMarker = (position: { lat: number; lng: number }, title: string, label: string, color: string, scale: number, onClick?: () => void, selected = false, kind: 'circle' | 'base' | 'courier' = 'circle', onDragEnd?: (position: { latitude: number; longitude: number }) => void) => {
      const marker = new api.maps.Marker({
        map: map.current, position, title, label: kind === 'circle' ? label : kind === 'courier' ? { text: label, color: tokenColor('foreground'), fontWeight: '700', fontSize: '13px' } : null, zIndex: selected ? 20 : kind === 'courier' ? 10 : 1,
        animation: selected ? api.maps.Animation.DROP : undefined,
        draggable: Boolean(onDragEnd),
        icon: kind === 'circle'
          ? { path: api.maps.SymbolPath.CIRCLE, fillColor: tokenColor(color), fillOpacity: 1, strokeColor: tokenColor(selected ? 'primary' : 'background'), strokeWeight: selected ? 4 : 2, scale: selected ? scale + 2 : scale }
          : markerIcon(api, kind, color, selected),
      });
      marker.addListener('click', () => {
        const content = document.createElement('div');
        content.textContent = title;
        info.setContent(content);
        info.open(map.current, marker);
        onClick?.();
      });
      if (onDragEnd) marker.addListener('dragend', () => {
        const point = marker.getPosition();
        if (point) onDragEnd({ latitude: point.lat(), longitude: point.lng() });
      });
      markers.current.push(marker);
      bounds.extend(position);
    };
    const basePosition = { lat: base.base_latitude, lng: base.base_longitude };
    addMarker(basePosition, `BASE · ${base.base_address}`, 'B', 'success', 11, undefined, false, 'base');
    locations.forEach(location => {
      const driver = couriers.find(item => item.id === location.courier_id);
      const assigned = deliveries.filter(delivery => delivery.courier_id === location.courier_id);
      const marmitas = assigned.reduce((total, delivery) => total + deliveryMarmitaQuantity(delivery), 0);
      const available = driver?.available_quantity;
      const stock = available === null || available === undefined ? 'carga não registrada' : `${available} marmita(s) disponível(is) para novas entregas`;
      addMarker(
        { lat: location.latitude, lng: location.longitude },
        `${location.name} · ${isCourierLocationStale(location.located_at) ? 'GPS DESATUALIZADO' : 'GPS AO VIVO'} · ${stock} · ${marmitas} marmita(s) nas entregas abertas · atualizado ${new Date(location.located_at).toLocaleTimeString('pt-BR')}`,
        location.name.trim() || 'Entregador',
        isCourierLocationStale(location.located_at) ? 'muted-foreground' : 'primary', 10,
        () => onSelectCourier?.(location.courier_id),
        focus?.type === 'courier' && focus.courierId === location.courier_id,
        'courier',
      );
    });
    const routeStops = new Map(route?.stops.map(stop => [stop.delivery_id, stop]) ?? []);
    const pointForDelivery = (delivery: Delivery) => {
      if (editingLocation?.deliveryId === delivery.id) return { latitude: editingLocation.latitude, longitude: editingLocation.longitude };
      const routed = routeStops.get(delivery.id);
      if (routed) return { latitude: routed.latitude, longitude: routed.longitude };
      return deliveryCoordinates(delivery);
    };
    deliveries.forEach(delivery => {
      const point = pointForDelivery(delivery);
      if (!point) return;
      const available = !delivery.route_id && delivery.status === 'Pronto para entrega';
      const selected = delivery.id === selectedDeliveryId || selectedDeliveryIds?.includes(delivery.id) || delivery.id === editingLocation?.deliveryId;
      const editing = delivery.id === editingLocation?.deliveryId;
      addMarker(
        { lat: point.latitude, lng: point.longitude },
        `#${delivery.number} · ${delivery.customer} · ${editing ? 'PONTO EM CORREÇÃO · ' : available ? 'DISPONÍVEL · ' : ''}${deliveryMarmitaQuantity(delivery)} marmita(s) · ${delivery.status}`,
        String(delivery.position || delivery.number), editing ? 'destructive' : selected ? 'destructive' : available ? 'ember' : 'warning', available ? 8 : 6,
        available && !editingLocation ? () => onSelectDelivery?.(delivery.id) : undefined, selected, 'circle',
        editing ? onDeliveryPositionChange : undefined,
      );
    });
    if (route?.polyline) {
      const path = decodeRoutePolyline(route.polyline).map(point => ({ lat: point.latitude, lng: point.longitude }));
      line.current = new api.maps.Polyline({ map: map.current, path, strokeWeight: 5, strokeOpacity: 0.8, strokeColor: tokenColor('primary') });
      path.forEach(point => bounds.extend(point));
    }
    const fitKey = `${base.base_latitude}:${base.base_longitude}:${route?.routeId ?? ''}:${deliveries.map(item => item.id).join(',')}:${locations.map(item => item.courier_id).join(',')}`;
    const explicitFocus = focus && focus.token !== lastFocus.current;
    if (editingLocation) {
      if (editingCentered.current !== editingLocation.deliveryId) {
        map.current.panTo({ lat: editingLocation.latitude, lng: editingLocation.longitude });
        map.current.setZoom(17);
        editingCentered.current = editingLocation.deliveryId;
      }
      fitted.current = fitKey;
    } else {
      editingCentered.current = '';
      if (explicitFocus) {
        if (focus.type === 'courier') {
          const location = locations.find(item => item.courier_id === focus.courierId);
          if (location) { map.current.panTo({ lat: location.latitude, lng: location.longitude }); map.current.setZoom(16); }
        } else if (focus.type === 'delivery') {
          const delivery = deliveries.find(item => item.id === focus.deliveryId);
          const point = delivery ? pointForDelivery(delivery) : null;
          if (point) { map.current.panTo({ lat: point.latitude, lng: point.longitude }); map.current.setZoom(16); }
        } else if (focus.type === 'base') {
          map.current.panTo(basePosition); map.current.setZoom(15);
        } else if (!bounds.isEmpty()) {
          map.current.fitBounds(bounds, 56);
        }
        fitted.current = fitKey;
        lastFocus.current = focus.token;
      } else if (!bounds.isEmpty() && fitted.current !== fitKey) {
        map.current.fitBounds(bounds, 56);
        fitted.current = fitKey;
      }
    }
    return () => { info.close(); };
  }, [api, base, locations, deliveries, couriers, route, focus, selectedDeliveryId, selectedDeliveryIds, editingLocation, onSelectCourier, onSelectDelivery, onDeliveryPositionChange]);

  if (!base) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">A base ainda não foi configurada.</p>;
  return <div className="space-y-2">
    {editingLocation && editingDelivery && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-primary/10 p-3" role="region" aria-label={`Correção do ponto do pedido ${editingDelivery.number}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Pencil size={17} /></span>
      <div className="min-w-52 flex-1"><b className="text-sm">Corrigindo o ponto do pedido #{editingDelivery.number}</b><p className="text-xs text-muted-foreground">Toque no local correto ou arraste o alfinete. O endereço escrito não muda.</p></div>
      <Button size="sm" variant="outline" disabled={savingLocation} onClick={onCancelDeliveryPosition}><X size={14} />Cancelar</Button>
      <Button size="sm" disabled={!editingLocation.touched || savingLocation} onClick={onSaveDeliveryPosition}>{savingLocation ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}{savingLocation ? 'Salvando…' : 'Salvar ponto'}</Button>
    </div>}
    {error ? <div role="alert" className="grid h-[360px] place-items-center rounded-xl border bg-muted p-6 text-center md:h-[480px]"><div><MapPinned className="mx-auto mb-3 text-muted-foreground" /><p className="max-w-lg text-sm text-muted-foreground">{error}</p><p className="mt-2 text-xs text-muted-foreground">Os endereços e os botões para abrir a navegação continuam disponíveis.</p></div></div> : <div ref={container} className="h-[360px] w-full rounded-xl border md:h-[480px]" aria-label="Mapa da base, entregadores e entregas" />}
  </div>;
}

declare global {
  interface Window {
    google?: GoogleApi;
    __ultrabrasaMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}
