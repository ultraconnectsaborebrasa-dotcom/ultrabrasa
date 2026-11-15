import { describe, it, expect } from 'vitest';
import { ruleParse } from '@/lib/whatsapp-rulebot';
import { conversationDraftSchema, missingOrderFields } from '@/lib/whatsapp-business';
const fold = (lines: string[]) => { let d = conversationDraftSchema.parse({}); for (let p = 0; p < 2; p++) for (const l of lines) d = ruleParse(l, d, 'm', missingOrderFields(d)).draft; return d; };
describe('rulebot reads separate customer messages', () => {
  it('collects order sent across several messages', () => {
    const d = fold(['Rua Mabel 409 Juca rosa', 'Pagamento Pix', 'Um só', 'Manuela']);
    expect(d.items[0]?.qty).toBe(1); expect(d.address.number).toBe('409'); expect(d.payment).toBe('Pix'); expect(d.customer).toBe('Manuela');
  });
  it('reads multi-line message with neighborhood', () => {
    const d = fold(['Seria somente uma', 'No Dinah Borges', 'Rua cuba 395', 'Pagamento em dinheiro']);
    expect(d.items[0]?.qty).toBe(1); expect(d.address.neighborhood).toBe('Dinah Borges'); expect(d.payment).toBe('Dinheiro');
  });
  it('reads "vou querer duas"', () => { expect(fold(['Vou querer duas pra ser entregue meio dia']).items[0]?.qty).toBe(2); });
});
