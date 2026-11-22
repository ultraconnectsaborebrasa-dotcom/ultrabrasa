import { describe, expect, it } from 'vitest';
import { canEditOpenOrder, openOrderTotals } from '@/lib/open-order-edit';

describe('edição de comanda aberta', () => {
  it('permite Administrador/Caixa editar etapas abertas sem pagamento', () => {
    expect(canEditOpenOrder({ status: 'aberta', payments: [] })).toBe(true);
    expect(canEditOpenOrder({ status: 'cozinha', payments: [] })).toBe(true);
    expect(canEditOpenOrder({ status: 'pronto', payments: [] })).toBe(true);
  });

  it('bloqueia comanda paga, cancelada ou em entrega', () => {
    expect(canEditOpenOrder({ status: 'cozinha', paymentStatus: 'pago' })).toBe(false);
    expect(canEditOpenOrder({ status: 'pronto', hasPayment: true })).toBe(false);
    expect(canEditOpenOrder({ status: 'cancelado', payments: [] })).toBe(false);
    expect(canEditOpenOrder({ status: 'entrega', payments: [] })).toBe(false);
  });

  it('recalcula subtotal, serviço e total após adicionar e remover produtos', () => {
    const original = { items: [{ price: 20, qty: 1 }], discount: 2, fee: 5, serviceFee: true };
    expect(openOrderTotals(original, 10)).toEqual({ subtotal: 20, service: 2, total: 25 });
    expect(openOrderTotals({ ...original, items: [...original.items, { price: 8, qty: 2 }] }, 10)).toEqual({ subtotal: 36, service: 3.6, total: 42.6 });
    expect(openOrderTotals({ ...original, items: [{ price: 8, qty: 1 }] }, 10)).toEqual({ subtotal: 8, service: 0.8, total: 11.8 });
  });
});
