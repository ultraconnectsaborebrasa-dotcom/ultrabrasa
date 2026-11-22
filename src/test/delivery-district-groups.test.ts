import { describe, expect, it } from 'vitest';
import { courierActiveDeliveries, groupDeliveriesByDistrict } from '@/lib/delivery-dispatch';
import { deliveryZone } from '@/lib/eunapolis-delivery';
import { emptyAddress, type Delivery } from '@/lib/delivery';

const makeDelivery = (id: string, neighborhood: string, patch: Partial<Delivery> = {}): Delivery => ({
  id, order_id: `order-${id}`, number: Number(id.replace(/\D/g, '')) || 1, customer: `Cliente ${id}`, phone: '',
  address: { ...emptyAddress(), neighborhood }, created_at: '2026-11-22T01:00:00Z', delivered_at: null,
  status: 'Pronto para entrega', route_id: null, position: 0, courier_id: null,
  total: null, due: null, payment_method: 'Pix', change: null, problem: null, items: [], ...patch,
});

describe('agrupamento por distritos oficiais', () => {
  it('reúne bairros diferentes do mesmo distrito e mantém outros distritos separados', () => {
    const pequi = makeDelivery('1', 'Pequi');
    const cajueiro = makeDelivery('2', 'Cajueiro');
    const centro = makeDelivery('3', 'Centro');
    const groups = groupDeliveriesByDistrict([centro, pequi, cajueiro]);
    const group = groups.find(item => item.id === 'pequi');
    expect(group?.name).toBe('04 · Pequi');
    expect(group?.neighborhoods.map(item => item.name)).toEqual(['Cajueiro', 'Pequi']);
    expect(group?.deliveries.map(item => item.id)).toEqual(['1', '2']);
    expect(groups.find(item => item.id === 'centro')?.deliveries).toEqual([centro]);
  });

  it('mantém bairros desconhecidos em Distrito a confirmar', () => {
    const groups = groupDeliveriesByDistrict([makeDelivery('1', 'Parque das Flores')]);
    expect(groups[0]?.id).toBe('unassigned');
    expect(groups[0]?.name).toBe('Distrito a confirmar');
  });

  it('reconhece variações já digitadas sem inventar um novo bairro', () => {
    expect(deliveryZone({ ...emptyAddress(), neighborhood: 'Ariosvaldo reis' })?.id).toBe('arnaldao');
    expect(deliveryZone({ ...emptyAddress(), neighborhood: 'alicrim 01' })?.id).toBe('alecrim');
    expect(deliveryZone({ ...emptyAddress(), neighborhood: 'Arnaldao' })?.id).toBe('arnaldao');
  });
});

describe('entregas atuais de cada motoboy', () => {
  it('lista somente entregas atribuídas e ainda abertas, da mais antiga para a mais nova', () => {
    const old = makeDelivery('1', 'Centro', { courier_id: 'mateus', route_id: 'r1' });
    const recent = makeDelivery('2', 'Pequi', { courier_id: 'mateus', route_id: 'r1', created_at: '2026-11-22T02:00:00Z', status: 'Em rota' });
    const delivered = makeDelivery('3', 'Centro', { courier_id: 'mateus', route_id: 'r1', status: 'Entregue' });
    const other = makeDelivery('4', 'Centro', { courier_id: 'outro', route_id: 'r2' });
    expect(courierActiveDeliveries([recent, delivered, other, old], 'mateus').map(item => item.id)).toEqual(['1', '2']);
  });
});
