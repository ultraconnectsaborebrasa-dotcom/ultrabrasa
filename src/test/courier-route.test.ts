import { describe, expect, it } from 'vitest';
import { courierRouteProgress, courierRouteStatus } from '@/lib/courier-route';
import { emptyDelivery, type Delivery } from '@/lib/delivery';

const stop = (id: string, position: number, status: Delivery['status']): Delivery => ({
  id,
  order_id: `order-${id}`,
  number: position,
  customer: `Cliente ${id}`,
  phone: '',
  address: { ...emptyDelivery().address, street: 'Rua A', number: '10', neighborhood: 'Centro' },
  created_at: '2026-11-19T12:00:00Z',
  delivered_at: status === 'Entregue' ? '2026-11-19T13:00:00Z' : null,
  status,
  route_id: 'route-1',
  position,
  courier_id: 'courier-1',
  total: 19.9,
  due: 0,
  payment_method: 'Pix',
  change: null,
  problem: null,
  items: [],
});

describe('fluxo de paradas do entregador', () => {
  it('destaca a primeira parada pendente na ordem designada', () => {
    const progress = courierRouteProgress([stop('b', 2, 'Pronto para entrega'), stop('a', 1, 'Pronto para entrega')]);
    expect(progress.nextStop?.id).toBe('a');
    expect(progress.ready).toBe(true);
    expect(courierRouteStatus([stop('a', 1, 'Pronto para entrega')])).toBe('Pronta para sair');
  });

  it('avança para a próxima parada somente após a baixa manual da anterior', () => {
    const progress = courierRouteProgress([stop('a', 1, 'Entregue'), stop('b', 2, 'Em rota'), stop('c', 3, 'Pronto para entrega')]);
    expect(progress.nextStop?.id).toBe('b');
    expect(progress.delivered).toBe(1);
    expect(progress.moving).toBe(true);
  });

  it('não sugere outra parada quando todas foram concluídas', () => {
    const stops = [stop('a', 1, 'Entregue'), stop('b', 2, 'Entregue')];
    expect(courierRouteProgress(stops).nextStop).toBeNull();
    expect(courierRouteStatus(stops)).toBe('Concluída');
  });
});
