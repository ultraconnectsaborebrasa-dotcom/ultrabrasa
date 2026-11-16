import { describe, expect, it } from 'vitest';
import { hasExplicitNewOrderIntent, shouldResumeAfterConfirmedOrder } from '@/lib/whatsapp-order-followup';

const confirmedAt = '2026-11-16T13:00:00.000Z'; // 10h em São Paulo
const sameLunch = new Date('2026-11-16T14:00:00.000Z');
const nextLunch = new Date('2026-11-17T14:00:00.000Z');

describe('Atendimento depois de pedido confirmado', () => {
  it.each(['Obrigada!', 'Qual é o prazo de entrega?', 'Já enviei o comprovante', 'Bom dia'])('não retoma no mesmo período com: %s', text => {
    expect(shouldResumeAfterConfirmedOrder(text, confirmedAt, sameLunch)).toBe(false);
  });

  it.each(['Quero fazer outro pedido', 'Quero mais uma marmita', 'Quero 2 marmitas', 'Novo pedido'])('reconhece uma nova compra explícita: %s', text => {
    expect(hasExplicitNewOrderIntent(text)).toBe(true);
    expect(shouldResumeAfterConfirmedOrder(text, confirmedAt, sameLunch)).toBe(true);
  });

  it.each(['Onde está meu outro pedido?', 'Quero cancelar meu pedido', 'Qual é o prazo do pedido?'])('não confunde uma dúvida sobre o pedido anterior com nova compra: %s', text => {
    expect(shouldResumeAfterConfirmedOrder(text, confirmedAt, nextLunch)).toBe(false);
  });

  it.each(['Bom dia', 'Quero 1 marmita', 'O que tem hoje?'])('permite um novo atendimento em outro período: %s', text => {
    expect(shouldResumeAfterConfirmedOrder(text, confirmedAt, nextLunch)).toBe(true);
  });
});
