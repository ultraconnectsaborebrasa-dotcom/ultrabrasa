import { describe, expect, it } from 'vitest';
import { buildOrderMessage, validateCheckout, type CartLine, type CheckoutForm } from './catalog';

const cart: CartLine[] = [{ productId: 'm', name: 'Marmita completa', price: 19.9, qty: 2, note: 'sem salada' }];
const base: CheckoutForm = { customer: 'Ana', phone: '73 99999-0000', type: 'Delivery', address: { street: 'Rua A', number: '10', neighborhood: 'Centro', complement: '', reference: 'Praça' }, requestedTime: '', payment: 'Pix', needChange: false, cashFor: '', note: '' };

describe('catalog checkout', () => {
  it('requires a payment method', () => expect(validateCheckout({ ...base, payment: null }, cart)).toBe('Escolha a forma de pagamento'));
  it('requires street, number and neighborhood for delivery', () => expect(validateCheckout({ ...base, address: { ...base.address, number: '' } }, cart)).toBe('Informe rua, número e bairro'));
  it('pickup does not need an address', () => expect(validateCheckout({ ...base, type: 'Retirada', address: { street: '', number: '', neighborhood: '', complement: '', reference: '' } }, cart)).toBeNull());
  it('change must exceed the total', () => expect(validateCheckout({ ...base, payment: 'Dinheiro', needChange: true, cashFor: '39,80' }, cart)).toMatch(/Troco/));
  it('card on delivery asks for the card machine', () => expect(buildOrderMessage('C1001', { ...base, payment: 'Crédito' }, cart)).toContain('Levar maquininha'));
  it('summary keeps payment pending and includes order code and total', () => {
    const m = buildOrderMessage('C1001', { ...base, payment: 'Dinheiro', needChange: true, cashFor: '50' }, cart);
    expect(m).toContain('Pedido C1001'); expect(m).toContain('Situação do pagamento: pendente'); expect(m).toContain('39,80'); expect(m).toContain('Troco para R$ 50,00');
  });
});
