import { describe, expect, it } from 'vitest';
import { catalogPreparationMinutes, catalogScheduleAvailable, buildOrderMessage, validateCheckout, dailyOfferState, dailyOfferHasLowStock, type CartLine, type CheckoutForm, type DailyOffer } from './catalog';

const cart: CartLine[] = [{ productId: 'm', name: 'Marmita completa', price: 19.9, qty: 2, note: 'sem salada' }];
const base: CheckoutForm = { customer: 'Ana', phone: '73 99999-0000', type: 'Delivery', address: { street: 'Rua A', number: '10', neighborhood: 'Centro', complement: '', reference: 'Praça' }, requestedTime: '', payment: 'Pix', needChange: false, cashFor: '', note: '' };

describe('catalog local schedule', () => {
  const at = (time: string) => new Date(`2026-11-15T${time}:00-03:00`);
  it('marmitas open at 09:00 and close exactly at 14:00 even with legacy 15:00 settings', () => {
    expect(catalogScheduleAvailable('Marmitas', { lunchEnd: '15:00' }, at('08:59'))).toBe(false);
    expect(catalogScheduleAvailable('Marmitas', { lunchEnd: '15:00' }, at('09:00'))).toBe(true);
    expect(catalogScheduleAvailable('Marmitas', { lunchEnd: '15:00' }, at('13:59'))).toBe(true);
    expect(catalogScheduleAvailable('Marmitas', { lunchEnd: '15:00' }, at('14:00'))).toBe(false);
  });
  it('marmitas open at 09:00 with the stored 09:00 setting', () => {
    expect(catalogScheduleAvailable('Marmitas', { lunchStart: '09:00', lunchEnd: '14:00' }, at('08:59'))).toBe(false);
    expect(catalogScheduleAvailable('Marmitas', { lunchStart: '09:00', lunchEnd: '14:00' }, at('09:00'))).toBe(true);
  });
  it('hamburgers open exactly at 17:00 before preparation', () => {
    expect(catalogScheduleAvailable('Hambúrgueres', null, at('16:59'))).toBe(false);
    expect(catalogScheduleAvailable('Hambúrgueres', null, at('17:00'))).toBe(true);
  });
  it('accompaniments open exactly at 17:00', () => {
    expect(catalogScheduleAvailable('Acompanhamentos', null, at('16:59'))).toBe(false);
    expect(catalogScheduleAvailable('Acompanhamentos', null, at('17:00'))).toBe(true);
  });
  it('skewers follow the hamburger schedule from 17:00 with preparation at 18:00', () => {
    expect(catalogScheduleAvailable('Espetinhos', null, at('16:59'))).toBe(false);
    expect(catalogScheduleAvailable('Espetinhos', null, at('17:00'))).toBe(true);
    expect(catalogScheduleAvailable('Espetinhos', null, at('17:30'))).toBe(true);
    expect(catalogPreparationMinutes()).toBe(1080);
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
  it('daily-menu summary identifies the public menu origin and free delivery', () => {
    const m = buildOrderMessage('C1002', base, cart, 'daily-menu');
    expect(m).toContain('Marmita do Dia · Cardápio público');
    expect(m).toMatch(/Taxa de entrega: R\$\s0,00/);
    expect(m).toContain('Situação do pagamento: pendente');
  });
});

describe('daily marmita offer', () => {
  const offer: DailyOffer = {
    productId: 'product-marmita-completa', name: 'Marmita completa', title: 'Cardápio de hoje',
    description: 'Churrasco, carne assada e linguiça de frango', accompaniments: ['Arroz'], active: true,
    price: 19.9, stock: 10, minStock: 5, available: true, image: null,
  };
  it('blocks new orders and reports sold out at zero stock', () => {
    expect(dailyOfferState({ ...offer, stock: 0, available: false }, true)).toBe('sold-out');
  });
  it('shows low stock only with a real limited stock at or below the threshold', () => {
    expect(dailyOfferHasLowStock({ ...offer, stock: 5 })).toBe(true);
    expect(dailyOfferHasLowStock({ ...offer, stock: 6 })).toBe(false);
    expect(dailyOfferHasLowStock({ ...offer, stock: null })).toBe(false);
    expect(dailyOfferHasLowStock({ ...offer, stock: 0 })).toBe(false);
  });
  it('respects offer deactivation, product availability and the lunch schedule', () => {
    expect(dailyOfferState({ ...offer, active: false }, true)).toBe('inactive');
    expect(dailyOfferState({ ...offer, available: false }, true)).toBe('unavailable');
    expect(dailyOfferState(offer, false)).toBe('closed');
    expect(dailyOfferState(offer, true)).toBe('available');
  });
});
