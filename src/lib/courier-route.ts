import { canFinishDelivery, type Delivery } from './delivery';

export function courierRouteProgress(stops: Delivery[]) {
  const ordered = [...stops].sort((a, b) => a.position - b.position);
  const nextStop = ordered.find(stop => canFinishDelivery(stop.status)) ?? null;
  const delivered = ordered.filter(stop => stop.status === 'Entregue').length;
  const ready = ordered.length > 0 && ordered.every(stop => stop.status === 'Pronto para entrega');
  const moving = ordered.some(stop => stop.status === 'Em rota');
  const waiting = ordered.some(stop => stop.status === 'Aguardando preparo');
  return { ordered, nextStop, delivered, ready, moving, waiting };
}

export function courierRouteStatus(stops: Delivery[]): string {
  const progress = courierRouteProgress(stops);
  if (!progress.nextStop) return 'Concluída';
  if (progress.moving) return 'Em rota';
  if (progress.ready) return 'Pronta para sair';
  if (progress.waiting) return 'Aguardando preparo';
  return 'Em organização';
}
