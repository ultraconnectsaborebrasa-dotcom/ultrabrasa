import { describe, expect, it } from 'vitest';
import { conversationDraftSchema, customerNameWithProfile, missingOrderFields, summaryReady } from '@/lib/whatsapp-business';
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

  it('reconhece o nome da Núbia antes dos outros dados e não usa a referência como nome ou rua', () => {
    let d = parse('Núbia Dantas ramos', conversationDraftSchema.parse({ items: [{ productId: 'm', qty: 2 }] }));
    expect(d.customer).toBe('Núbia Dantas Ramos');
    d = parse('Rua do oeste número 30', d);
    d = parse('Quase em frente a praça Dr Gusmão', d);
    expect(d.customer).toBe('Núbia Dantas Ramos');
    expect(d.address).toMatchObject({ street: 'Rua do oeste', number: '30', reference: 'Quase em frente a praça Dr Gusmão' });
    d = parse('Dinheiro', d);
    d = parse('Dr gusmao', d);
    d = parse('Não precisa', d);
    expect(d.customer).toBe('Núbia Dantas Ramos');
    expect(summaryReady(d, 39.8)).toBe(true);
  });

  it('não aceita uma referência como nome mesmo quando só falta o nome', () => {
    const d = parse('Quase em frente a praça Dr Gusmão', { ...valid, customer: '' });
    expect(d.customer).toBe('');
    expect(d.address.street).toBe('Rua das Flores');
    expect(summaryReady(d, 19.9)).toBe(false);
  });

  it.each(['Ok Tbem', 'tudo bem', 'bom dia', 'obrigado'])('não reconhece a resposta conversacional "%s" como nome', (text) => {
    const d = parse(text, { ...valid, customer: '' });
    expect(d.customer).toBe('');
    expect(summaryReady(d, 19.9)).toBe(false);
  });

  it('usa o nome do WhatsApp quando o nome digitado é inválido', () => {
    expect(customerNameWithProfile('Ok Tbem', 'Lurdes')).toBe('Lurdes');
  });

  it('não mistura uma instrução de entrega com o nome da cliente', () => {
    const d = parse('Flávia mas vai entregar, Rua A, 12, bairro Centro');
    expect(d.customer).toBe('');
    expect(customerNameWithProfile(d.customer, 'flavisilva98')).toBe('flavisilva98');
  });

  it.each(['Pode ser', 'Pode mandar', 'Uma'])('não usa a resposta "%s" como nome', (text) => {
    expect(customerNameWithProfile(text, null)).toBe('');
  });

  it('usa o nome do WhatsApp quando o cliente não informou o nome', () => {
    expect(customerNameWithProfile('', 'Lurdes')).toBe('Lurdes');
  });

  it('não substitui um nome válido informado pelo cliente', () => {
    expect(customerNameWithProfile('Núbia Dantas Ramos', 'Núbia Ramos')).toBe('Núbia Dantas Ramos');
  });

  it('continua pedindo o nome quando o perfil também não é válido', () => {
    expect(customerNameWithProfile('Ok Tbem', 'bom dia')).toBe('');
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

  it('lê rua, número e bairro antes de "atrás da" e guarda só o final como referência', () => {
    const d = parse('Rua Raimundo nascimento, 225 centauro, atrás da prime fit', { ...valid, address: { street: '', number: '', neighborhood: '', city: '', reference: '', complement: '' } });
    expect(d.address).toMatchObject({ street: 'Rua Raimundo nascimento', number: '225', neighborhood: 'centauro', reference: 'atrás da prime fit' });
    expect(summaryReady(d, 19.9)).toBe(true);
  });

  it('entende a rua abreviada com "R" e o número com "n."', () => {
    const d = parse('R guaratinga n.55 centro', { ...valid, address: { street: '', number: '', neighborhood: '', city: '', reference: '', complement: '' } });
    expect(d.address).toMatchObject({ street: 'R guaratinga', number: '55', neighborhood: 'centro' });
    expect(summaryReady(d, 19.9)).toBe(true);
  });

  it('aceita "não tem número" como S/N quando só falta o número', () => {
    const d = parse('Não tem número E uma guarita', { ...valid, address: { ...valid.address, number: '' } });
    expect(d.address.number).toBe('S/N');
    expect(summaryReady(d, 19.9)).toBe(true);
  });

  it('não grava "e centro" como bairro', () => {
    const d = parse('Bairro e centro', { ...valid, address: { ...valid.address, neighborhood: '' } });
    expect(d.address.neighborhood).toBe('centro');
  });
});
