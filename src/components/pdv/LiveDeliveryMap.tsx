import { useEffect, useRef, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { deliveryCoordinates, deliveryMarmitaQuantity, type Courier, type Delivery } from '@/lib/delivery';
import { decodeRoutePolyline, isCourierLocationStale, type CourierLiveLocation, type DeliveryBase, type DeliveryRouteCalculation } from '@/lib/courier-operations';

type GoogleApi = any;
type MapMarker = { setMap: (map: unknown) => void };
export type DeliveryMapFocus = { type: 'all' | 'base' | 'courier' | 'delivery'; courierId?: string | undefined; deliveryId?: string | undefined; token: number };
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
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new api.maps.Size(size, size), anchor: new api.maps.Point(size / 2, size / 2) };
}

export function LiveDeliveryMap({ base, locations, deliveries, couriers, route, focus, selectedDeliveryId, onSelectCourier, onSelectDelivery }: {
  base: DeliveryBase | null;
  locations: CourierLiveLocation[];
  deliveries: Delivery[];
  couriers: Courier[];
  route: (DeliveryRouteCalculation & { routeId: string }) | null;
  focus?: DeliveryMapFocus | null;
  selectedDeliveryId?: string | null;
  onSelectCourier?: (courierId: string) => void;
  onSelectDelivery?: (deliveryId: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleApi>(null);
  const markers = useRef<MapMarker[]>([]);
  const line = useRef<GoogleApi>(null);
  const fitted = useRef('');
  const lastFocus = useRef(0);
  const [api, setApi] = useState<GoogleApi>(null);
  const [error, setError] = useState('');

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
    if (!api || !map.current || !base) return;
    markers.current.forEach(marker => marker.setMap(null));
    markers.current = [];
    if (line.current) line.current.setMap(null);
    const bounds = new api.maps.LatLngBounds();
    const info = new api.maps.InfoWindow();
    const addMarker = (position: { lat: number; lng: number }, title: string, label: string, color: string, scale: number, onClick?: () => void, selected = false, kind: 'circle' | 'base' | 'courier' = 'circle') => {
      const marker = new api.maps.Marker({
        map: map.current, position, title, label: kind === 'circle' ? label : null, zIndex: selected ? 20 : kind === 'courier' ? 10 : 1,
        animation: selected ? api.maps.Animation.DROP : undefined,
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
        location.name.trim().slice(0, 1).toUpperCase() || 'M',
        isCourierLocationStale(location.located_at) ? 'muted-foreground' : 'primary', 10,
        () => onSelectCourier?.(location.courier_id),
        focus?.type === 'courier' && focus.courierId === location.courier_id,
        'courier',
      );
    });
    const routeStops = new Map(route?.stops.map(stop => [stop.delivery_id, stop]) ?? []);
    const pointForDelivery = (delivery: Delivery) => {
      const routed = routeStops.get(delivery.id);
      if (routed) return { latitude: routed.latitude, longitude: routed.longitude };
      return deliveryCoordinates(delivery);
    };
    deliveries.forEach(delivery => {
      const point = pointForDelivery(delivery);
      if (!point) return;
      const available = !delivery.route_id && delivery.status === 'Pronto para entrega';
      const selected = delivery.id === selectedDeliveryId;
      addMarker(
        { lat: point.latitude, lng: point.longitude },
        `#${delivery.number} · ${delivery.customer} · ${available ? 'DISPONÍVEL · ' : ''}${deliveryMarmitaQuantity(delivery)} marmita(s) · ${delivery.status}`,
        String(delivery.position || delivery.number), selected ? 'destructive' : available ? 'ember' : 'warning', available ? 8 : 6,
        available ? () => onSelectDelivery?.(delivery.id) : undefined, selected,
      );
    });
    if (route?.polyline) {
      const path = decodeRoutePolyline(route.polyline).map(point => ({ lat: point.latitude, lng: point.longitude }));
      line.current = new api.maps.Polyline({ map: map.current, path, strokeWeight: 5, strokeOpacity: 0.8, strokeColor: tokenColor('primary') });
      path.forEach(point => bounds.extend(point));
    }
    const fitKey = `${base.base_latitude}:${base.base_longitude}:${route?.routeId ?? ''}:${deliveries.map(item => item.id).join(',')}:${locations.map(item => item.courier_id).join(',')}`;
    const explicitFocus = focus && focus.token !== lastFocus.current;
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
    return () => { info.close(); };
  }, [api, base, locations, deliveries, couriers, route, focus, selectedDeliveryId, onSelectCourier, onSelectDelivery]);

  if (!base) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">A base ainda não foi configurada.</p>;
  return <div>
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
