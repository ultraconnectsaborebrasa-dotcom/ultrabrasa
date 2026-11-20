import { canFinishDelivery, marmitaSelectionError, type Courier, type Delivery } from './delivery';

export type CourierLocationQuality = 'live' | 'stale' | 'missing';
export type DispatchCandidate = {
  courier: Courier;
  score: number;
  distanceMeters: number | null;
  pending: number;
  fitsExistingRoute: boolean;
};

/**
 * Sugestão operacional apenas: o administrador sempre confirma a atribuição.
 * Sem GPS usa distância desconhecida e penalização, nunca uma distância inventada.
 */
export function rankDispatchCouriers(
  couriers: Courier[],
  deliveries: Delivery[],
  selected: Delivery,
  distances: Map<string, number>,
  locationQuality: Map<string, CourierLocationQuality>,
): DispatchCandidate[] {
  return couriers.filter(courier => courier.active)
    .filter(courier => !marmitaSelectionError(courier, deliveries, [selected]))
    .map(courier => {
      const pending = deliveries.filter(delivery => delivery.id !== selected.id && delivery.courier_id === courier.id && canFinishDelivery(delivery.status)).length;
      const fitsExistingRoute = pending > 0;
      const distanceMeters = distances.get(courier.id) ?? null;
      const quality = locationQuality.get(courier.id) ?? 'missing';
      const distanceScore = distanceMeters === null ? 50 : distanceMeters / 1000;
      const locationPenalty = quality === 'live' ? 0 : quality === 'stale' ? 25 : 50;
      const score = distanceScore + locationPenalty + pending * 2.5 - (fitsExistingRoute ? 1.5 : 0);
      return { courier, score, distanceMeters, pending, fitsExistingRoute };
    })
    .sort((a, b) => a.score - b.score || a.courier.name.localeCompare(b.courier.name, 'pt-BR'));
}
