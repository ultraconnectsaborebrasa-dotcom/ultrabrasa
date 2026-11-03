import { describe, it, expect } from 'vitest';
import { conversationDraftSchema, summaryReady, missingOrderFields } from './whatsapp-business';
const base = conversationDraftSchema.parse({});
describe('resumo só com pedido válido', () => {
  it('saudação sem produto não gera resumo', () => expect(summaryReady(base, 0)).toBe(false));
  it('marmita com total R$ 0,00 não gera resumo', () => {
    const d = { ...base, customer: 'Ana', items: [{ productId: 'm', qty: 1, note: '' }], type: 'Retirada' as const, payment: 'Pix' as const };
    expect(missingOrderFields(d)).toEqual([]); expect(summaryReady(d, 0)).toBe(false); expect(summaryReady(d, 19.9)).toBe(true);
  });
  it('entrega sem bairro ou sem pagamento não gera resumo', () => {
    const d = { ...base, customer: 'Ana', items: [{ productId: 'm', qty: 1, note: '' }], type: 'Delivery' as const, address: { ...base.address, street: 'Rua A', number: '10' }, payment: null };
    expect(summaryReady(d, 19.9)).toBe(false);
  });
});
