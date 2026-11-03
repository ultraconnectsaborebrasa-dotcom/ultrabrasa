import { describe, expect, it } from 'vitest';
import { paid, type Order } from './pdv-store';
import { paidSalesSince } from './sales-history';

const base = { id: 'x', number: 1, type: 'Delivery', items: [], discount: 0, fee: 0, serviceFee: false, createdAt: 1000, paidAt: 2000 } as unknown as Order;

describe('Vendas hoje', () => {
  it('conta pagamento conferido de R$ 19,90 mesmo com o pedido ainda em entrega', () => {
    const o = { ...base, status: 'entrega', paymentStatus: 'pago', payments: [{ method: 'Pix', amount: 19.9, verification: 'confirmed' }] } as Order;
    const today = paidSalesSince([o], 0);
    expect(today.reduce((a, x) => a + paid(x), 0)).toBeCloseTo(19.9);
  });
  it('não soma comprovante ainda não conferido', () => {
    const o = { ...base, status: 'cozinha', paymentStatus: 'pago', payments: [{ method: 'Pix', amount: 19.9, verification: 'unverified' }] } as Order;
    expect(paidSalesSince([o], 0).reduce((a, x) => a + paid(x), 0)).toBe(0);
  });
});
