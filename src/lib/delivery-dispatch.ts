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
  selection: Delivery | Delivery[],
  distances: Map<string, number>,
  locationQuality: Map<string, CourierLocationQuality>,
): DispatchCandidate[] {
  const selected = Array.isArray(selection) ? selection : [selection];
  if (!selected.length) return [];
  const selectedIds = new Set(selected.map(delivery => delivery.id));
  return couriers.filter(courier => courier.active)
    .filter(courier => !marmitaSelectionError(courier, deliveries, selected))
    .map(courier => {
      const pending = deliveries.filter(delivery => !selectedIds.has(delivery.id) && delivery.courier_id === courier.id && canFinishDelivery(delivery.status)).length;
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

export type DeliveryNeighborhoodGroup = { id: string; name: string; deliveries: Delivery[] };

/** Agrupa somente saídas designáveis, sem consultar o Google nem alterar os endereços. */
export function groupDeliveriesByNeighborhood(deliveries: Delivery[]): DeliveryNeighborhoodGroup[] {
  const groups = new Map<string, DeliveryNeighborhoodGroup>();
  deliveries.filter(delivery => !delivery.route_id && delivery.status === 'Pronto para entrega').forEach(delivery => {
    const name = delivery.address.neighborhood.trim() || 'Bairro não informado';
    const id = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
    const group = groups.get(id) ?? { id, name, deliveries: [] };
    group.deliveries.push(delivery);
    groups.set(id, group);
  });
  return [...groups.values()].map(group => ({
    ...group,
    deliveries: group.deliveries.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.number - b.number),
  })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
