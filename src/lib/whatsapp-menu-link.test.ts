import { describe, it, expect } from 'vitest';
import { businessSchema, initialLunchMessage, menuOutsideNightMessage, closedMenuMessage, isNightMenuAsk, nightMenuOffHours, lunchQtyAck, followUpMessage, lunchPresented } from './whatsapp-business';
const b = businessSchema.parse({ lunchMenu: 'carne assada e linguiça de frango, arroz, salada, macarrão e farofa de feijão', departureFrom: '11:00', freeDelivery: true, acceptAdvanceOrders: true });
const at = new Date('2026-11-03T10:37:00Z'); // 07:37 em Eunápolis
describe('cardápio da marmita sem link nem PDF', () => {
  it('Bom dia → O que tem hoje? → 1', () => {
    const menu = initialLunchMessage(b, at, 19.9);
    expect(menu).toBe('Hoje temos marmita com carne assada e linguiça de frango, arroz, salada, macarrão e farofa de feijão, por R$\u00a019,90 😋\n\nEntrega grátis para qualquer bairro de Eunápolis! As entregas começam a sair às 11h.\n\nQuer deixar seu pedido adiantado? Me fala quantas marmitas e o bairro da entrega 😊');
    expect(lunchPresented([menu], b)).toBe(true);
    expect(`${lunchQtyAck(1)} ${followUpMessage(['entrega ou retirada', 'rua', 'número', 'bairro', 'forma de pagamento', 'nome'])}`).toBe('Uma marmita, combinado! 😊 Me passa a rua, o número e o bairro da entrega.');
  });
  it('mensagens de marmita e de loja fechada nunca têm link ou PDF', () => {
    for (const t of [menuOutsideNightMessage(b, { price: 19.9, available: true, menuUrl: 'https://ultraconnectbrasa.com.br/cardapio', pdfOffer: true, now: at }), closedMenuMessage(b, { price: 19.9, menuUrl: 'https://ultraconnectbrasa.com.br/cardapio', pdfOffer: true, now: at })]) {
      expect(t).not.toMatch(/https?:|PDF/);
    }
  });
  it('link só quando pedem o cardápio da noite', () => {
    expect(isNightMenuAsk('O que tem hoje?')).toBe(false);
    expect(isNightMenuAsk('tem hambúrguer?')).toBe(true);
    expect(nightMenuOffHours(b, 'https://ultraconnectbrasa.com.br/cardapio', at)).toContain('https://ultraconnectbrasa.com.br/cardapio');
  });
});
