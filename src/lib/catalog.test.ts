import { describe, expect, it } from 'vitest';
import { catalogPreparationMinutes, catalogScheduleAvailable, buildOrderMessage, validateCheckout, type CartLine, type CheckoutForm } from './catalog';

const cart: CartLine[] = [{ productId: 'm', name: 'Marmita completa', price: 19.9, qty: 2, note: 'sem salada' }];
const base: CheckoutForm = { customer: 'Ana', phone: '73 99999-0000', type: 'Delivery', address: { street: 'Rua A', number: '10', neighborhood: 'Centro', complement: '', reference: 'Praça' }, requestedTime: '', payment: 'Pix', needChange: false, cashFor: '', note: '' };

describe('catalog local schedule', () => {
  const at = (time: string) => new Date(`2026-11-15T${time}:00-03:00`);
  it('marmitas close exactly at 14:00 even with legacy 15:00 settings', () => {
    expect(catalogScheduleAvailable('Marmitas', { lunchEnd: '15:00' }, at('13:59'))).toBe(true);
    expect(catalogScheduleAvailable('Marmitas', { lunchEnd: '15:00' }, at('14:00'))).toBe(false);
  });
  it('hamburgers open exactly at 17:00 before preparation', () => {
    expect(catalogScheduleAvailable('Hambúrgueres', null, at('16:59'))).toBe(false);
    expect(catalogScheduleAvailable('Hambúrgueres', null, at('17:00'))).toBe(true);
  });
  it('accompaniments open exactly at 17:00', () => {
    expect(catalogScheduleAvailable('Acompanhamentos', null, at('16:59'))).toBe(false);
    expect(catalogScheduleAvailable('Acompanhamentos', null, at('17:00'))).toBe(true);
  });
  it('preparation begins at 18:00 without blocking advance orders', () => {
    expect(catalogPreparationMinutes()).toBe(1080);
    expect(catalogScheduleAvailable('Hambúrgueres', null, at('17:30'))).toBe(true);
  });
});

describe('catalog checkout', () => {
  it('requires a payment method', () => expect(validateCheckout({ ...base, payment: null }, cart)).toBe('Escolha a forma de pagamento'));
  it('requires street, number and neighborhood for delivery', () => expect(validateCheckout({ ...base, address: { ...base.address, number: '' } }, cart)).toBe('Informe rua, número e bairro'));
  it('pickup does not need an address', () => expect(validateCheckout({ ...base, type: 'Retirada', address: { street: '', number: '', neighborhood: '', complement: '', reference: '' } }, cart)).toBeNull());
  it('change must exceed the total', () => expect(validateCheckout({ ...base, payment: 'Dinheiro', needChange: true, cashFor: '39,80' }, cart)).toMatch(/Troco/));
  it('card on delivery asks for the card machine', () => expect(buildOrderMessage('C1001', { ...base, payment: 'Crédito' }, cart)).toContain('Levar maquininha'));
  it('summary keeps payment pending and includes order code and total', () => {
    const m = buildOrderMessage('C1001', { ...base, payment: 'Dinheiro', needChange: true, cashFor: '50' }, cart);
    expect(m).toContain('Pedido C1001'); expect(m).toContain('Situação do pagamento: pendente'); expect(m).toMatch(/39,80/); expect(m).toMatch(/Troco para R\$\s50,00/);
  });
});
