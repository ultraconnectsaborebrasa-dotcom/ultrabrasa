import { describe, expect, it } from 'vitest';
import { COURIER_SHIFTS, courierTimeTotals, currentCourierShift, decodeRoutePolyline, formatCourierDistance, isCourierLocationStale, rankCourierLocations, shouldSendCourierPosition, type CourierLiveLocation } from '@/lib/courier-operations';

describe('ponto e localização dos entregadores', () => {
  it('fixa a manhã das 11:00 às 14:00 e o valor em R$ 60', () => {
    expect(COURIER_SHIFTS.morning).toMatchObject({ start: '11:00', end: '14:00', amount: 60 });
  });
  it('fixa a noite das 18:00 às 22:00 e o valor em R$ 60', () => {
    expect(COURIER_SHIFTS.night).toMatchObject({ start: '18:00', end: '22:00', amount: 60 });
  });
  it('mostra a manhã antes das 18h e somente a noite a partir das 18h em São Paulo', () => {
    expect(currentCourierShift(new Date('2026-11-19T11:23:00Z'))).toBe('morning');
    expect(currentCourierShift(new Date('2026-11-19T20:59:00Z'))).toBe('morning');
    expect(currentCourierShift(new Date('2026-11-19T21:00:00Z'))).toBe('night');
  });
  it('soma R$ 60 por turno registrado e separa os concluídos', () => {
    expect(courierTimeTotals([{ amount: 60, exit_at: null }, { amount: 60, exit_at: '2026-11-19T01:00:00Z' }])).toEqual({ registered: 120, completed: 60 });
  });
  it('marca posição antiga como desatualizada', () => {
    const now = new Date('2026-11-19T03:01:00Z').getTime();
    expect(isCourierLocationStale('2026-11-19T03:00:30Z', now)).toBe(false);
    expect(isCourierLocationStale('2026-11-19T02:59:59Z', now)).toBe(true);
  });
  it('limita o envio a cada 15 segundos, com movimento ou atualização de 60 segundos', () => {
    const previous = { latitude: -16.35, longitude: -39.57, sentAt: 100_000 };
    expect(shouldSendCourierPosition(previous, { latitude: -16.3504, longitude: -39.57 }, 114_999)).toBe(false);
    expect(shouldSendCourierPosition(previous, { latitude: -16.3504, longitude: -39.57 }, 115_000)).toBe(true);
    expect(shouldSendCourierPosition(previous, { latitude: -16.35, longitude: -39.57 }, 159_999)).toBe(false);
    expect(shouldSendCourierPosition(previous, { latitude: -16.35, longitude: -39.57 }, 160_000)).toBe(true);
  });
  it('ordena os motoboys pela distância real até a entrega', () => {
    const location = (courier_id: string, latitude: number): CourierLiveLocation => ({ courier_id, name: courier_id, latitude, longitude: -39.57, accuracy_meters: 10, located_at: '2026-11-19T03:00:00Z', consent_at: '2026-11-19T02:00:00Z' });
    const ranked = rankCourierLocations({ latitude: -16.35, longitude: -39.57 }, [location('longe', -16.36), location('perto', -16.35)]);
    expect(ranked.map(item => item.courier_id)).toEqual(['perto', 'longe']);
    expect(Math.round(ranked[0]?.distanceMeters ?? -1)).toBe(0);
    expect(Math.round(ranked[1]?.distanceMeters ?? -1)).toBe(1112);
    expect(formatCourierDistance(ranked[1]?.distanceMeters ?? 0)).toBe('1,1 km');
  });
  it('decodifica o trajeto devolvido pelo Google sem biblioteca adicional', () => {
    expect(decodeRoutePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });
});
