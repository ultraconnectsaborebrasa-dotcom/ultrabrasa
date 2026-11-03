import { describe, it, expect } from 'vitest';
import { defaultBusiness, initialLunchMessage, followUpMessage, lunchQtyAck, lunchPresented } from './whatsapp-business';
const morning = new Date('2026-11-03T13:00:00Z'); // 10h em Eunápolis
describe('ordem do atendimento de marmitas', () => {
  it('apresenta composição e preço antes de pedir quantidade', () => {
    const m = initialLunchMessage({ ...defaultBusiness, lunchMenu: 'carne assada' }, morning, 19.9);
    expect(m.startsWith('Hoje temos marmita com carne assada, por R$')).toBe(true);
    expect(m).toContain('19,90');
    expect(m).toContain('As entregas começam a sair às 11h');
    expect(m).toContain('Me fala quantas marmitas e o bairro da entrega');
  });
  it('após "1" pede só rua, número e bairro', () => {
    expect(`${lunchQtyAck(1)} ${followUpMessage(['entrega ou retirada','forma de pagamento'])}`).toBe('Uma marmita, combinado! 😊 Me passa a rua, o número e o bairro da entrega.');
  });
  it('detecta apresentação já enviada', () => {
    expect(lunchPresented(['Hoje temos marmita com x'], defaultBusiness)).toBe(true);
    expect(lunchPresented(['Oi!'], defaultBusiness)).toBe(false);
  });
});
