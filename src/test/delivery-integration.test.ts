import { describe, expect, it } from 'vitest';
import { buildExternalDeliveryPayload, pdvStageForCallback } from '@/lib/delivery-integration';
import { emptyDelivery, type DeliveryInput } from '@/lib/delivery';
import type { Order } from '@/lib/pdv-store';

const delivery: DeliveryInput = {
  ...emptyDelivery(), paymentMethod: 'Pix', chargeDeliveryFee: true,
  address: { ...emptyDelivery().address, street: 'Rua das Flores', number: '123', neighborhood: 'Centro', complement: 'Casa', reference: 'Próximo à praça', latitude: '-16.37', longitude: '-39.58' },
};
const order: Order = {
  id: 'order-abc', number: 901, type: 'Delivery', customer: 'Maria Silva', customerPhone: '73999999999',
  items: [{ uid: '1', productId: 'marmita', name: 'Marmita completa', price: 19.9, qty: 1, note: 'Sem salada' }],
  note: 'Tocar o interfone', discount: 0, fee: 5, serviceFee: false, payments: [], paymentStatus: 'pendente', status: 'pronto', createdAt: Date.parse('2026-11-18T12:00:00Z'), delivery,
};

describe('contrato com UltraBrasa Entregas', () => {
  it('converte o pedido completo com total, endereço, observações e coordenadas', () => {
    const payload = buildExternalDeliveryPayload(order);
    expect(payload).toMatchObject({
      order_id: 'order-abc', order_number: '901', customer_name: 'Maria Silva',
      neighborhood: 'Centro', total: 24.9, delivery_fee: 5, payment_status: 'pendente', delivery_type: 'delivery',
      destination_latitude: -16.37, destination_longitude: -39.58,
      items: [{ name: 'Marmita completa', quantity: 1 }],
    });
    expect(payload.address).toContain('Rua das Flores, 123');
    expect(payload.notes).toContain('Sem salada');
    expect(payload.notes).toContain('Tocar o interfone');
  });

  it('recusa pedido sem endereço ou nome válido antes de qualquer envio', () => {
    expect(() => buildExternalDeliveryPayload({ ...order, delivery: undefined })).toThrow('Somente pedidos Delivery');
    expect(() => buildExternalDeliveryPayload({ ...order, customer: '' })).toThrow();
    expect(() => buildExternalDeliveryPayload({ ...order, delivery: { ...delivery, address: { ...delivery.address, street: '' } } })).toThrow();
  });

  it('sincroniza somente os eventos que mudam a etapa no PDV', () => {
    expect(pdvStageForCallback('delivery.started')).toBe('entrega');
    expect(pdvStageForCallback('delivery.completed')).toBe('entregue');
    expect(pdvStageForCallback('delivery.cancelled')).toBe('cancelado');
    expect(pdvStageForCallback('delivery.failed')).toBeNull();
    expect(pdvStageForCallback('courier.assigned')).toBeNull();
  });
});
