import { useEffect, useRef, useState } from 'react';
import { MapPinned } from 'lucide-react';
import type { Delivery } from '@/lib/delivery';
import { decodeRoutePolyline, type CourierLiveLocation, type DeliveryBase, type DeliveryRouteCalculation } from '@/lib/courier-operations';

type GoogleApi = any;
type MapMarker = { setMap: (map: unknown) => void };
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

export function LiveDeliveryMap({ base, locations, deliveries, route }: {
  base: DeliveryBase | null;
  locations: CourierLiveLocation[];
  deliveries: Delivery[];
  route: (DeliveryRouteCalculation & { routeId: string }) | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleApi>(null);
  const markers = useRef<MapMarker[]>([]);
  const line = useRef<GoogleApi>(null);
  const fitted = useRef('');
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
    const addMarker = (position: { lat: number; lng: number }, title: string, label: string) => {
      const marker = new api.maps.Marker({ map: map.current, position, title, label });
      marker.addListener('click', () => {
        const content = document.createElement('div');
        content.textContent = title;
        info.setContent(content);
        info.open(map.current, marker);
      });
      markers.current.push(marker);
      bounds.extend(position);
    };
    const basePosition = { lat: base.base_latitude, lng: base.base_longitude };
    addMarker(basePosition, `Base · ${base.base_address}`, 'B');
    locations.forEach(location => addMarker(
      { lat: location.latitude, lng: location.longitude },
      `${location.name} · atualizado ${new Date(location.located_at).toLocaleTimeString('pt-BR')}`,
      location.name.trim().slice(0, 1).toUpperCase() || 'E',
    ));
    const routeStops = new Map(route?.stops.map(stop => [stop.delivery_id, stop]) ?? []);
    deliveries.forEach(delivery => {
      const routed = routeStops.get(delivery.id);
      const latitude = routed?.latitude ?? Number(delivery.address.latitude);
      const longitude = routed?.longitude ?? Number(delivery.address.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (!routed && (!delivery.address.latitude || !delivery.address.longitude))) return;
      addMarker({ lat: latitude, lng: longitude }, `#${delivery.number} · ${delivery.customer}`, String(delivery.position || delivery.number));
    });
    if (route?.polyline) {
      const path = decodeRoutePolyline(route.polyline).map(point => ({ lat: point.latitude, lng: point.longitude }));
      line.current = new api.maps.Polyline({ map: map.current, path, strokeWeight: 5, strokeOpacity: 0.8 });
      path.forEach(point => bounds.extend(point));
    }
    const fitKey = `${base.base_latitude}:${base.base_longitude}:${route?.routeId ?? ''}:${deliveries.map(item => item.id).join(',')}:${locations.map(item => item.courier_id).join(',')}`;
    if (!bounds.isEmpty() && fitted.current !== fitKey) {
      map.current.fitBounds(bounds, 48);
      fitted.current = fitKey;
    }
    return () => { info.close(); };
  }, [api, base, locations, deliveries, route]);

  if (!base) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">A base ainda não foi configurada.</p>;
  return <div>
    {error ? <div role="alert" className="grid h-[320px] place-items-center rounded-lg border bg-muted p-6 text-center md:h-[420px]"><div><MapPinned className="mx-auto mb-3 text-muted-foreground" /><p className="max-w-lg text-sm text-muted-foreground">{error}</p><p className="mt-2 text-xs text-muted-foreground">Os endereços e os botões para abrir a navegação continuam disponíveis.</p></div></div> : <div ref={container} className="h-[320px] w-full rounded-lg border md:h-[420px]" aria-label="Mapa da base, entregadores e entregas" />}
  </div>;
}

declare global {
  interface Window {
    google?: GoogleApi;
    __ultrabrasaMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}
