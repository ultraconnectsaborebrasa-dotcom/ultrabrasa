import { describe, expect, it } from 'vitest';
import { groupDeliveriesByNeighborhood, rankDispatchCouriers } from '@/lib/delivery-dispatch';
import { emptyDelivery, type Courier, type Delivery } from '@/lib/delivery';

const courier = (id: string, available = 10): Courier => ({
  id, name: id, phone: '', user_id: null, active: true, operational_status: 'available',
  initial_quantity: available, remaining_quantity: available, product_id: 'product-marmita-completa', product_name: 'Marmita completa',
});
const delivery: Delivery = {
  id: 'new', order_id: 'new', number: 1, customer: 'Cliente', phone: '', created_at: '', delivered_at: null,
  address: emptyDelivery().address, status: 'Pronto para entrega', route_id: null, position: 0, courier_id: null,
  total: null, due: null, payment_method: 'Pix', change: null, problem: null,
  items: [{ productId: 'product-marmita-completa', name: 'Marmita completa', qty: 1 }],
};

describe('sugestão de entregadores', () => {
  it('ordena pela combinação de distância real conhecida e pendências', () => {
    const couriers = [courier('perto'), courier('longe')];
    const result = rankDispatchCouriers(couriers, [], delivery, new Map([['perto', 200], ['longe', 2000]]), new Map([['perto', 'live'], ['longe', 'live']]));
    expect(result.map(item => item.courier.id)).toEqual(['perto', 'longe']);
  });

  it('não recomenda quem está sem estoque, indisponível ou com outro tipo de marmita', () => {
    const empty = courier('vazio', 0);
    const unavailable = { ...courier('ausente'), operational_status: 'returning' as const };
    const incompatible = { ...courier('outro'), product_id: 'product-marmita-especial', product_name: 'Marmita especial' };
    expect(rankDispatchCouriers([empty, unavailable, incompatible], [], delivery, new Map(), new Map())).toEqual([]);
  });

  it('considera as reservas abertas antes de recomendar', () => {
    const reserved: Delivery = { ...delivery, id: 'reserved', order_id: 'reserved', courier_id: 'ocupado', route_id: 'route-1', status: 'Em rota' };
    expect(rankDispatchCouriers([courier('ocupado', 1)], [reserved], delivery, new Map(), new Map())).toEqual([]);
  });

  it('não inventa distância para GPS ausente e prioriza posição ao vivo', () => {
    const result = rankDispatchCouriers([courier('sem-gps'), courier('ao-vivo')], [], delivery, new Map([['ao-vivo', 500]]), new Map([['ao-vivo', 'live']]));
    expect(result[0]?.courier.id).toBe('ao-vivo');
    expect(result[1]?.distanceMeters).toBeNull();
  });

  it('exige estoque para todas as entregas selecionadas do grupo', () => {
    const second = { ...delivery, id: 'second', order_id: 'second', number: 2 };
    expect(rankDispatchCouriers([courier('somente-uma', 1)], [], [delivery, second], new Map(), new Map())).toEqual([]);
    expect(rankDispatchCouriers([courier('duas-livres', 2)], [], [delivery, second], new Map(), new Map())[0]?.courier.id).toBe('duas-livres');
  });

  it('agrupa pelo bairro informado, sem incluir saídas já designadas ou concluídas', () => {
    const older = { ...delivery, id: 'older', number: 1, created_at: '2026-11-21T12:00:00Z', address: { ...delivery.address, neighborhood: 'Centro' } };
    const newer = { ...delivery, id: 'newer', number: 2, created_at: '2026-11-21T13:00:00Z', address: { ...delivery.address, neighborhood: ' centro ' } };
    const other = { ...delivery, id: 'other', number: 3, address: { ...delivery.address, neighborhood: 'Pequi' } };
    const assigned = { ...delivery, id: 'assigned', route_id: 'route-1' };
    const completed = { ...delivery, id: 'completed', status: 'Entregue' as const };
    const groups = groupDeliveriesByNeighborhood([older, newer, other, assigned, completed]);
    expect(groups.map(group => [group.name, group.deliveries.map(item => item.id)])).toEqual([['Centro', ['older', 'newer']], ['Pequi', ['other']]]);
  });
});
