import { describe, expect, it } from 'vitest';
import { conversationDraftSchema, missingOrderFields, summaryReady } from '@/lib/whatsapp-business';
import { recentInboundChunks, ruleParse } from '@/lib/whatsapp-rulebot';

const empty = conversationDraftSchema.parse({});
const parse = (text: string, previous = empty) => ruleParse(text, previous, 'm', missingOrderFields(previous)).draft;
const valid = conversationDraftSchema.parse({
  customer: 'Maria Silva', items: [{ productId: 'm', qty: 1 }], type: 'Delivery', payment: 'Pix',
  address: { street: 'Rua das Flores', number: '45', neighborhood: 'Centro' },
});

describe('nome e endereço sem adivinhação', () => {
  it('não confunde pagamento com nome nem o número do logradouro com o da casa', () => {
    const d = parse('Quero 1 marmita, Rua 5 de Novembro, 125, bairro Juca Rosa, pagamento no crédito');
    expect(d.customer).toBe('');
    expect(d.address).toMatchObject({ street: 'Rua 5 de Novembro', number: '125', neighborhood: 'Juca Rosa' });
    expect(missingOrderFields(d)).toEqual(['nome']);
    expect(summaryReady(d, 19.9)).toBe(false);
  });

  it('não usa o número do nome da rua como número da casa', () => {
    const d = parse('Rua 5 de Novembro, bairro Centro');
    expect(d.address.street).toBe('Rua 5 de Novembro');
    expect(d.address.number).toBe('');
    expect(missingOrderFields(d)).toContain('número');
  });

  it('não usa o nome da pessoa como bairro', () => {
    const previous = { ...valid, customer: 'Cleia', address: { ...valid.address, street: 'Rua Monte Serrat', number: '70', neighborhood: '' } };
    const d = parse('Cleia', previous);
    expect(d.customer).toBe('Cleia');
    expect(d.address.neighborhood).toBe('');
    expect(missingOrderFields(d)).toContain('bairro');
  });

  it('não transforma referência em nome da rua', () => {
    const d = parse('Laura, rua fica depois da travessa Rio de Janeiro, 119, bairro Vivendas Costa Azul, Pix');
    expect(missingOrderFields(d)).toContain('rua');
    expect(summaryReady(d, 19.9)).toBe(false);
  });

  it.each(['Pagamento no crédito', 'Vcs entrega', 'Marmita', 'Por favor'])('não interpreta "%s" como nome ou bairro', (text) => {
    const d = parse(text, { ...valid, customer: '', address: { ...valid.address, neighborhood: '' } });
    expect(d.customer).toBe('');
    expect(d.address.neighborhood).toBe('');
    expect(summaryReady(d, 19.9)).toBe(false);
  });

  it('aceita nome quando é o único dado que falta', () => {
    const d = parse('Maria Silva', { ...valid, customer: '' });
    expect(d.customer).toBe('Maria Silva');
    expect(summaryReady(d, 19.9)).toBe(true);
  });

  it('não deixa nome e bairro duplicados passarem no resumo', () => {
    const d = { ...valid, customer: 'Juca Rosa', address: { ...valid.address, neighborhood: 'Juca Rosa' } };
    expect(missingOrderFields(d)).toContain('bairro');
    expect(summaryReady(d, 19.9)).toBe(false);
  });

  it('reconhece bairro repetido mesmo com a cidade ao final', () => {
    const d = { ...valid, customer: 'Juca Rosa', address: { ...valid.address, neighborhood: 'Juca Rosa — Eunápolis' } };
    expect(missingOrderFields(d)).toContain('bairro');
    expect(summaryReady(d, 19.9)).toBe(false);
  });

  it('não relê o endereço antigo depois que o cliente corrige e o robô responde', () => {
    const messages = [
      { direction: 'in', body: 'Rua Errada, 10, bairro Centro', kind: 'text', wa_message_id: 'old', created_at: '2026-11-16T11:00:00.000Z' },
      { direction: 'out', body: 'Me passa o nome.', kind: 'text', wa_message_id: 'out-1', created_at: '2026-11-16T11:01:00.000Z' },
      { direction: 'in', body: 'Rua Certa, 20, bairro Juca Rosa', kind: 'text', wa_message_id: 'correction', created_at: '2026-11-16T11:02:00.000Z' },
      { direction: 'out', body: 'Me passa só o nome.', kind: 'text', wa_message_id: 'out-2', created_at: '2026-11-16T11:03:00.000Z' },
      { direction: 'in', body: 'Maria', kind: 'text', wa_message_id: 'current', created_at: '2026-11-16T11:04:00.000Z' },
    ];
    expect(recentInboundChunks(messages, 'current', '2026-11-16T10:00:00.000Z')).toEqual(['Maria']);
  });
});
