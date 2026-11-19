import { saoPauloDay } from '@/lib/courier-operations';
import type { Delivery, DeliveryRoute } from '@/lib/delivery';

const KITCHEN_EXIT_STATUSES: Delivery['status'][] = ['Pronto para entrega', 'Em rota'];

export function isCurrentKitchenDelivery(delivery: Delivery, day = saoPauloDay()): boolean {
  if (!KITCHEN_EXIT_STATUSES.includes(delivery.status)) return false;
  const eventAt = delivery.status === 'Em rota' && delivery.departed_at ? delivery.departed_at : delivery.created_at;
  const timestamp = new Date(eventAt).getTime();
  return Number.isFinite(timestamp) && saoPauloDay(new Date(timestamp)) === day;
}

export function currentKitchenDeliveries(deliveries: Delivery[], day = saoPauloDay()): Delivery[] {
  return deliveries.filter(delivery => isCurrentKitchenDelivery(delivery, day));
}

export function currentKitchenRoutes(routes: DeliveryRoute[], deliveries: Delivery[], day = saoPauloDay()): DeliveryRoute[] {
  const routeIds = new Set(currentKitchenDeliveries(deliveries, day).map(delivery => delivery.route_id).filter((id): id is string => Boolean(id)));
  return routes.filter(route => routeIds.has(route.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
