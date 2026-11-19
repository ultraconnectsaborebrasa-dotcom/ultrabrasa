export const COURIER_SHIFT_AMOUNT = 60;
export const COURIER_SHIFTS = {
  morning: { code: 'morning', label: 'Turno da manhã', start: '11:00', end: '14:00', amount: COURIER_SHIFT_AMOUNT },
  night: { code: 'night', label: 'Turno da noite', start: '18:00', end: '22:00', amount: COURIER_SHIFT_AMOUNT },
} as const;
export type CourierShiftCode = keyof typeof COURIER_SHIFTS;

export type DeliveryBase = {
  id: number;
  base_address: string;
  base_latitude: number;
  base_longitude: number;
  base_place_id: string | null;
};
export type CourierTimeEntry = {
  id: string;
  courier_id: string;
  courier_name: string;
  shift_date: string;
  shift_code: CourierShiftCode;
  scheduled_start: string;
  scheduled_end: string;
  entry_at: string;
  exit_at: string | null;
  amount: number;
};
export type CourierLiveLocation = {
  courier_id: string;
  name: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  located_at: string;
  consent_at: string;
};
export type CourierOperations = {
  base: DeliveryBase | null;
  current_courier_id: string | null;
  locations: CourierLiveLocation[];
  time_entries: CourierTimeEntry[];
};
export type RouteStopLocation = { delivery_id: string; customer: string; latitude: number; longitude: number };
export type DeliveryRouteCalculation = {
  polyline: string;
  distance_meters: number;
  duration_seconds: number;
  stops: RouteStopLocation[];
};

export function canReadCourierOperations(access: { admin?: boolean; courier?: boolean }): boolean {
  return Boolean(access.admin || access.courier);
}

export function saoPauloDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function currentCourierShift(date = new Date()): CourierShiftCode {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute >= 18 * 60 ? 'night' : 'morning';
}

export function courierTimeTotals(entries: Pick<CourierTimeEntry, 'amount' | 'exit_at'>[]) {
  return {
    registered: entries.reduce((sum, entry) => sum + Number(entry.amount), 0),
    completed: entries.filter(entry => entry.exit_at !== null).reduce((sum, entry) => sum + Number(entry.amount), 0),
  };
}

export function isCourierLocationStale(locatedAt: string, now = Date.now(), maxAgeMs = 60_000): boolean {
  const timestamp = new Date(locatedAt).getTime();
  return !Number.isFinite(timestamp) || now - timestamp > maxAgeMs;
}

export function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (value: number) => value * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

export function rankCourierLocations(point: { latitude: number; longitude: number }, locations: CourierLiveLocation[]) {
  return locations.map(location => ({ ...location, distanceMeters: haversineMeters(point, location) }))
    .filter(location => Number.isFinite(location.distanceMeters))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export function formatCourierDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function shouldSendCourierPosition(
  previous: { latitude: number; longitude: number; sentAt: number } | null,
  next: { latitude: number; longitude: number },
  now: number,
): boolean {
  if (!previous) return true;
  const elapsed = now - previous.sentAt;
  if (elapsed < 15_000) return false;
  return elapsed >= 60_000 || haversineMeters(previous, next) >= 25;
}

export function decodeRoutePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    for (const coordinate of ['latitude', 'longitude'] as const) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        if (index >= encoded.length) throw new Error('Linha de rota inválida.');
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = (result & 1) ? ~(result >> 1) : result >> 1;
      if (coordinate === 'latitude') latitude += delta;
      else longitude += delta;
    }
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}
