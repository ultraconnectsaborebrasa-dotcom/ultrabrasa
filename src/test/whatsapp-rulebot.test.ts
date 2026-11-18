import { describe, it, expect } from 'vitest';
import { botWindow, ruleParse, isEarlyLunch, windowStart, lunchMenuOpen, earlyLunchMessages, regularLunchMessages, faqReply, LUNCH_CLOSED_MESSAGE, NIGHT_MESSAGE, NIGHT_MENU_MESSAGE, nightOpeningMessage, AFTERNOON_MESSAGES, HANDOFF_MESSAGE } from '@/lib/whatsapp-rulebot';
import { conversationDraftSchema, missingOrderFields, defaultBusiness } from '@/lib/whatsapp-business';
const empty = conversationDraftSchema.parse({});
const at = (hm: string) => new Date(`2026-11-16T${hm}:00-03:00`);
describe('bot tradicional', () => {
  it('janelas de horário de Brasília', () => {
    expect(botWindow(at('09:00'))).toBe('lunch');
    expect(botWindow(at('13:59'))).toBe('lunch');
    expect(botWindow(at('14:00'))).toBe('lunch');
    expect(botWindow(at('16:59'))).toBe('afterLunch');
    expect(botWindow(at('17:00'))).toBe('night');
    expect(botWindow(at('18:00'))).toBe('night');
    expect(botWindow(at('22:09'))).toBe('night');
    expect(botWindow(at('22:10'))).toBe('closed');
    expect(botWindow(at('07:59'))).toBe('closed');
  });
  it('aceita pedidos antecipados a partir das 08h', () => {
    expect(botWindow(at('07:59'))).toBe('closed');
    expect(botWindow(at('08:00'))).toBe('lunch');
  });
  it('seleciona promoção somente das 08h às 10h', () => {
    expect(isEarlyLunch(at('07:59'))).toBe(false);
    expect(isEarlyLunch(at('08:00'))).toBe(true);
    expect(isEarlyLunch(at('09:59'))).toBe(true);
    expect(isEarlyLunch(at('10:00'))).toBe(false);
  });
  it('encerra marmitas às 14h20', () => {
    expect(botWindow(at('14:19'))).toBe('lunch');
    expect(botWindow(at('14:20'))).toBe('afterLunch');
    expect(windowStart(at('14:20'))).toBe(at('14:20').toISOString());
  });
  it('não reinicia a campanha na passagem das 10h', () => {
    expect(windowStart(at('08:00'))).toBe(at('08:00').toISOString());
    expect(windowStart(at('10:00'))).toBe(windowStart(at('09:59')));
  });
  it('guarda referência e preserva informações nas respostas seguintes', () => {
    const r = ruleParse('Quero 2 marmitas, meu nome é Ana, Rua A, 12, bairro Centro, referência: perto da escola', empty, 'm', missingOrderFields(empty));
    const next = ruleParse('Pix', r.draft, 'm', missingOrderFields(r.draft));
    expect(next.draft.items[0]?.qty).toBe(2);
    expect(next.draft.customer).toBe('Ana');
    expect(next.draft.address).toMatchObject({street:'Rua A',number:'12',neighborhood:'Centro',reference:'perto da escola'});
    expect(missingOrderFields(next.draft)).toEqual([]);
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
  it('disponibiliza o cardápio até 14h e os pedidos até 14h20', () => {
    expect(lunchMenuOpen(at('13:59'))).toBe(true);
    expect(lunchMenuOpen(at('14:00'))).toBe(false);
    expect(botWindow(at('14:19'))).toBe('lunch');
  });
  it('usa cinco partes no roteiro normal e remove escassez quando ela não está ativa', () => {
    expect(regularLunchMessages(defaultBusiness, 19.9)).toHaveLength(5);
    const semEscassez = { ...defaultBusiness, highDemand: false };
    expect(regularLunchMessages(semEscassez, 19.9)).toHaveLength(4);
    expect(earlyLunchMessages(semEscassez, 19.9).join(' ')).not.toContain('limitad');
  });
  it('responde preço, cardápio, entrega e horários com os dados cadastrados', () => {
    expect(faqReply('Qual o preço da marmita?', defaultBusiness, 19.9, at('11:00'))?.replace(/\s/g, ' ')).toContain('R$ 19,90');
    expect(faqReply('O que tem hoje?', defaultBusiness, 19.9, at('11:00'))).toContain(defaultBusiness.lunchMenu);
    expect(faqReply('A entrega é grátis?', defaultBusiness, 19.9, at('11:00'))).toContain('qualquer lugar de Eunápolis');
    expect(faqReply('Qual o prazo de entrega?', defaultBusiness, 19.9, at('11:00'))).toContain('30 a 45 minutos após o pedido sair');
    expect(faqReply('Qual o horário noturno?', defaultBusiness, 19.9, at('17:00'))).toContain('preparos começam às 18:00');
    expect(faqReply('O que tem hoje?', defaultBusiness, 19.9, at('14:20'))).toBe(LUNCH_CLOSED_MESSAGE);
    expect(NIGHT_MESSAGE).toContain('A partir das 17:00');
    expect(HANDOFF_MESSAGE).toContain('um atendente');
  });
  it('apresenta o atendimento da noite na primeira mensagem da tarde', () => {
    expect(AFTERNOON_MESSAGES).toHaveLength(2);
    expect(AFTERNOON_MESSAGES[0]).toContain('Boa tarde');
    expect(AFTERNOON_MESSAGES[0]).toContain('atendimento da noite começa a partir das 17:00');
    expect(AFTERNOON_MESSAGES[0]).toContain('preparos começam às 18:00');
  });
  it('envia o cardápio digital na segunda mensagem e convida o cliente a pedir', () => {
    expect(AFTERNOON_MESSAGES[1]).toContain('https://ultraconnectbrasa.com.br/cardapio');
    expect(AFTERNOON_MESSAGES[1]).toContain('me conta o que você gostaria de pedir');
    expect(AFTERNOON_MESSAGES.join(' ')).not.toMatch(/PDF|marmita/i);
  });
  it('inclui o link do cardápio na apresentação automática depois das 18h', () => {
    expect(nightOpeningMessage(at('17:59'))).toBe(NIGHT_MESSAGE);
    expect(nightOpeningMessage(at('18:00'))).toBe(NIGHT_MENU_MESSAGE);
    expect(NIGHT_MENU_MESSAGE).toContain('https://ultraconnectbrasa.com.br/cardapio');
    expect(faqReply('O que tem hoje?', defaultBusiness, 19.9, at('18:00'))).toContain('https://ultraconnectbrasa.com.br/cardapio');
  });
  it('registra troco no dinheiro e não pede troco no cartão ou Pix', () => {
    const base = ruleParse('Quero 1 marmita, meu nome é Ana, Rua A, 12, bairro Centro', empty, 'm', missingOrderFields(empty));
    const dinheiro = ruleParse('Dinheiro, troco para 50', base.draft, 'm', missingOrderFields(base.draft));
    expect(dinheiro.draft.cashFor).toBe(50);
    expect(missingOrderFields(dinheiro.draft)).toEqual([]);
    const pix = ruleParse('Pix', base.draft, 'm', missingOrderFields(base.draft));
    expect(missingOrderFields(pix.draft)).toEqual([]);
    const cartao = ruleParse('Cartão', base.draft, 'm', missingOrderFields(base.draft));
    expect(missingOrderFields(cartao.draft)).toEqual([]);
  });
  it('encaminha reclamações e problemas para atendente', () => {
    expect(ruleParse('Meu pedido errado, quero falar com alguém', empty, 'm', []).wantsHuman).toBe(true);
    expect(ruleParse('Tive problema com pagamento', empty, 'm', []).wantsHuman).toBe(true);
  });
});
