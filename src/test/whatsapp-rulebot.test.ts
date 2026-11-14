import { describe, it, expect } from 'vitest';
import { botWindow, ruleParse } from '@/lib/whatsapp-rulebot';
import { conversationDraftSchema, missingOrderFields } from '@/lib/whatsapp-business';
const empty = conversationDraftSchema.parse({});
const at = (hm: string) => new Date(`2026-11-16T${hm}:00-03:00`);
describe('bot tradicional', () => {
  it('janelas de horário de Brasília', () => {
    expect(botWindow(at('09:00'))).toBe('lunch');
    expect(botWindow(at('13:59'))).toBe('lunch');
    expect(botWindow(at('14:00'))).toBe('afterLunch');
    expect(botWindow(at('18:00'))).toBe('night');
    expect(botWindow(at('22:09'))).toBe('night');
    expect(botWindow(at('22:10'))).toBe('closed');
    expect(botWindow(at('08:59'))).toBe('closed');
  });
  it('extrai pedido completo numa mensagem', () => {
    const r = ruleParse('Quero 3 marmitas, meu nome é João, moro na Rua das Flores, 45, bairro Centro, vou pagar no Pix.', empty, 'm', missingOrderFields(empty));
    expect(r.draft.items[0]?.qty).toBe(3);
    expect(r.draft.customer).toBe('João');
    expect(r.draft.payment).toBe('Pix');
    expect(r.draft.address.number).toBe('45');
    expect(r.draft.address.neighborhood).toBe('Centro');
    expect(missingOrderFields(r.draft)).toEqual([]);
  });
  it('"1" sozinho vira uma marmita', () => {
    expect(ruleParse('1', empty, 'm', missingOrderFields(empty)).draft.items[0]?.qty).toBe(1);
  });
  it('nome curto quando só falta o nome', () => {
    const d = { ...empty, items: [{ productId: 'm', qty: 1, note: '' }], type: 'Delivery' as const, payment: 'Pix' as const, address: { ...empty.address, street: 'Rua A', number: '1', neighborhood: 'Centro' } };
    expect(ruleParse('Maria Silva', d, 'm', missingOrderFields(d)).draft.customer).toBe('Maria Silva');
  });
  it('confirmação com sim', () => {
    expect(ruleParse('Sim', empty, 'm', []).confirms).toBe(true);
  });
});
