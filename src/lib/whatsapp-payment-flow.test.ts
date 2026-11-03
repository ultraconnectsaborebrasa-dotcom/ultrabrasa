import { describe, it, expect } from 'vitest';
import { conversationDraftSchema, summaryReady, missingOrderFields, followUpMessage, addressAck, orderSummary } from './whatsapp-business';
const base = conversationDraftSchema.parse({});
const withAddr = { ...base, customer: 'Ana', items: [{ productId: 'm', qty: 1, note: '' }], type: 'Delivery' as const, address: { ...base.address, street: 'Rua das flores', number: '12', neighborhood: 'Encanto das Águas', city: 'Eunápolis' } };
const line = [{ name: 'marmita completa', qty: 1, price: 19.9 }];
describe('pagamento antes do resumo', () => {
  it('após o endereço pergunta pagamento, sem resumo', () => {
    expect(summaryReady(withAddr, 19.9)).toBe(false);
    expect(`${addressAck(withAddr.address)} ${followUpMessage(missingOrderFields(withAddr))}`).toBe('Entrega na Rua das Flores, 12, Encanto das Águas, combinado! Vai pagar no Pix, cartão ou dinheiro? 😊');
  });
  it('Pix gera o resumo esperado', () => {
    const d = { ...withAddr, payment: 'Pix' as const };
    expect(summaryReady(d, 19.9)).toBe(true);
    expect(orderSummary(d, line, 19.9)).toBe('Confere pra mim 😊\n\n1 marmita completa — R$\u00a019,90\nEntrega: Rua das Flores, 12 — Encanto das Águas\nPagamento: Pix — aguardando pagamento\nEntrega grátis\nTotal: R$\u00a019,90\n\nPosso confirmar seu pedido?');
  });
  it('Cartão: a receber na entrega', () => expect(orderSummary({ ...withAddr, payment: 'Cartão' }, line, 19.9)).toContain('Pagamento: Cartão na entrega — a receber'));
  it('Dinheiro pergunta troco antes do resumo', () => {
    const d = { ...withAddr, payment: 'Dinheiro' as const, cashFor: null };
    expect(summaryReady(d, 19.9)).toBe(false);
    expect(followUpMessage(missingOrderFields(d))).toBe('Precisa de troco? Se sim, pra quanto?');
  });
  it('Dinheiro com e sem troco', () => {
    expect(orderSummary({ ...withAddr, payment: 'Dinheiro', cashFor: 50 }, line, 19.9)).toContain('Dinheiro na entrega — a receber · troco para R$\u00a050,00');
    expect(orderSummary({ ...withAddr, payment: 'Dinheiro', cashFor: 0 }, line, 19.9)).toContain('· sem troco');
  });
  it('nunca mostra null', () => expect(orderSummary({ ...withAddr, payment: 'Pix' }, line, 19.9)).not.toMatch(/null|undefined|NaN/));
});
