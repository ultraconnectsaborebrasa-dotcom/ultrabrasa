import { describe, expect, it } from 'vitest';
import { canMountDeliveryRoute, currentKitchenDeliveries, currentKitchenRoutes } from '@/lib/delivery-operation';
import { emptyDelivery, type Delivery, type DeliveryRoute } from '@/lib/delivery';

const DAY = '2026-11-19';
const delivery = (id: string, status: Delivery['status'], created_at: string, departed_at: string | null = null, route_id: string | null = null): Delivery => ({
  id,
  order_id: `order-${id}`,
  number: 1,
  customer: 'Cliente',
  phone: '',
  address: { ...emptyDelivery().address, street: 'Rua A', number: '10', neighborhood: 'Centro' },
  created_at,
  departed_at,
  delivered_at: null,
  status,
  route_id,
  position: 0,
  courier_id: null,
  total: null,
  due: null,
  payment_method: 'Pix',
  change: null,
  problem: null,
  items: [],
});
const route = (id: string): DeliveryRoute => ({ id, name: id, courier_id: null, created_at: '2026-11-19T20:00:00Z', origin: '', distance_meters: null, duration_seconds: null });

describe('operação das saídas atuais da cozinha', () => {
  it('mantém prontos de hoje e saídas de hoje, mesmo quando o pedido foi criado antes', () => {
    const rows = [
      delivery('pronta-hoje', 'Pronto para entrega', '2026-11-19T20:00:00Z'),
      delivery('saiu-hoje', 'Em rota', '2026-11-18T20:00:00Z', '2026-11-19T22:00:00Z'),
      delivery('pronta-antiga', 'Pronto para entrega', '2026-11-18T20:00:00Z'),
      delivery('saiu-antes', 'Em rota', '2026-11-18T20:00:00Z', '2026-11-18T23:00:00Z'),
      delivery('preparando', 'Aguardando preparo', '2026-11-19T20:00:00Z'),
      delivery('entregue', 'Entregue', '2026-11-19T20:00:00Z', '2026-11-19T22:00:00Z'),
    ];
    expect(currentKitchenDeliveries(rows, DAY).map(item => item.id)).toEqual(['pronta-hoje', 'saiu-hoje']);
  });

  it('não deixa uma saída já designada continuar selecionada para montar outra rota', () => {
    expect(canMountDeliveryRoute(delivery('pronta', 'Pronto para entrega', '2026-11-19T20:00:00Z'))).toBe(true);
    expect(canMountDeliveryRoute(delivery('saiu', 'Em rota', '2026-11-19T20:00:00Z', '2026-11-19T22:00:00Z'))).toBe(false);
    expect(canMountDeliveryRoute(delivery('roteirizada', 'Pronto para entrega', '2026-11-19T20:00:00Z', null, 'rota-1'))).toBe(false);
    expect(canMountDeliveryRoute(delivery('entregue', 'Entregue', '2026-11-19T20:00:00Z'))).toBe(false);
  });

  it('mantém na tela somente rotas ligadas às saídas atuais e preserva as demais fora dela', () => {
    const rows = [
      delivery('atual', 'Em rota', '2026-11-19T20:00:00Z', '2026-11-19T22:00:00Z', 'rota-atual'),
      delivery('antiga', 'Pronto para entrega', '2026-11-18T20:00:00Z', null, 'rota-antiga'),
      delivery('concluida', 'Entregue', '2026-11-19T20:00:00Z', '2026-11-19T22:00:00Z', 'rota-concluida'),
    ];
    expect(currentKitchenRoutes([route('rota-antiga'), route('rota-atual'), route('rota-concluida')], rows, DAY).map(item => item.id)).toEqual(['rota-atual']);
  });
});
