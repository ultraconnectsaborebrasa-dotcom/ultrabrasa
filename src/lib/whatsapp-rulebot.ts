import type { Business, ConversationDraft } from './whatsapp-business';
import { validAddressField, validCustomerName } from './whatsapp-business';

/** Bot tradicional (sem IA): textos fixos, janelas de horário e extração por regras. */
export const GREETING_MESSAGE = 'Olá, tudo bem?';
export const LUNCH_CLOSED_MESSAGE = 'Infelizmente, os pedidos de marmitas de hoje já foram encerrados!\n\nAgradecemos muito pela procura e pela preferência.\n\nAmanhã estaremos recebendo novos pedidos a partir das 08:00.\n\nSerá um prazer atender você!';
export const NIGHT_MESSAGE = 'Olá, tudo bem?\n\nJá estamos nos preparando para atender você nesta noite!\n\nA partir das 17:00 temos salgados, acompanhamentos e hambúrgueres disponíveis. Os preparos começam às 18:00.\n\nMe conta o que você gostaria de pedir!';
export const NIGHT_MENU_MESSAGE = 'Boa noite, tudo bem? 😊\n\nJá estamos atendendo! Confira nosso cardápio digital: https://ultraconnectbrasa.com.br/cardapio\n\nDá uma olhadinha e me conta o que você gostaria de pedir.';
/** Resposta curta "já estamos atendendo" com o link do cardápio, usada a partir das 18:00. */
export const NIGHT_SERVING_MENU_MESSAGE = 'Já estamos atendendo! Confira nosso cardápio digital: https://ultraconnectbrasa.com.br/cardapio e me conta o que você gostaria de pedir.';
export const nightOpeningMessage = (now = new Date()) => spHM(now) >= '18:00' ? NIGHT_MENU_MESSAGE : NIGHT_MESSAGE;
/** A partir das 18:00 o cardápio digital substitui o aviso de "começa às 17:00". */
const nightHoursReply = (now: Date) => spHM(now) >= '18:00' ? NIGHT_SERVING_MENU_MESSAGE : 'A partir das 17:00 temos salgados, acompanhamentos e hambúrgueres. Os preparos começam às 18:00.';
export const AFTERNOON_MESSAGES = [
  'Boa tarde, tudo bem? 😊 Nosso atendimento da noite começa a partir das 17:00, com hambúrgueres, espetinhos, salgados e acompanhamentos. Os preparos começam às 18:00.',
  'Você já pode escolher seu pedido no nosso cardápio digital: https://ultraconnectbrasa.com.br/cardapio\n\nDá uma olhadinha e me conta o que você gostaria de pedir. Se precisar de ajuda, estou por aqui!',
] as const;
export const CLOSING_MESSAGE = 'Infelizmente, hoje já encerramos nossos atendimentos!\n\nNossa demanda foi muito alta e todos os pedidos foram atendidos.\n\nAmanhã estaremos funcionando normalmente. Então, já garanta seu pedido mais cedo para não ficar sem!\n\nAgradecemos pela compreensão e preferência. Deus abençoe!';
export const HANDOFF_MESSAGE = 'Vou encaminhar sua mensagem para um atendente, que vai ajudar você por aqui.';
export const CONFIRM_HINT = 'É só responder *SIM* para eu confirmar seu pedido. Se quiser mudar algo, me fala o que corrigir.';
export const ORDER_CONFIRMATION_REMINDER_DELAY_MS = 2 * 60 * 1000;
export const isOrderConfirmationReminderJob = (key: string) => key.startsWith('confirmation-reminder:');
export const FIRST_CONTACT_MESSAGE = 'Olá! Tudo bem? 😊 Você pode conferir nosso cardápio do dia e fazer seu pedido por aqui:\n\n👉 https://ultraconnectbrasa.com.br/marmita-do-dia\n\nConfirmando pelo link, seu pedido já chega para nossa equipe e conseguimos adiantar tudo para despachar mais rapidinho!';
export const FIRST_CONTACT_REMINDER_MESSAGE = 'E aí, conseguiu? Se teve alguma dificuldade, posso montar seu pedido por aqui mesmo, sem problema!';
export const FIRST_CONTACT_REMINDER_DELAY_MS = 3 * 60 * 1000;
export const isFirstContactJob = (key: string) => key.startsWith('first-contact:');
export const isFirstContactReminderJob = (key: string) => key.startsWith('first-contact-reminder:');
/** O link é uma opção: a escolha de pedir na conversa entra na coleta manual existente. */
export function prefersManualOrder(text: string): boolean {
  const n = norm(text);
  if (!/\bpor aqui(?: mesmo)?\b/.test(n)) return false;
  if (/\bnao\s+(?:quero|prefiro|prefere)\s+(?:pedir\s+|fazer\s+|montar\s+)?por aqui\b/.test(n)) return false;
  return /\b(?:prefir\w*|prefer\w*|quero|pode(?:\s+ser)?|melhor|faz|fazer|monta|montar|vou)\b/.test(n);
}
/** As campanhas antigas não podem mais agendar lembretes; somente a abertura única faz isso. */
export const isMenuCardMessage = (text: string) => text === FIRST_CONTACT_MESSAGE;

const brl = (price: number) => price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const promotionMessage = (b: Business, price: number) => `Nossa marmita está em promoção por apenas ${brl(price)}${b.freeDelivery ? ', com FRETE GRÁTIS para qualquer lugar de Eunápolis' : ''}!`;
const menuMessage = (b: Business) => `Hoje de cardápio temos:\n\n${b.lunchMenu}\n\nTudo preparado com muito carinho!`;
const orderPrompt = 'Vamos adiantar seu pedido?\n\nMe fala quantas marmitas você deseja e o endereço onde devemos entregar.\n\nAssim já podemos organizar tudo para você!';

/** Compatibilidade com a apresentação antiga, usada também como marca de deduplicação. */
export function earlyLunchMessage(b: Business, price: number): string {
  return earlyLunchMessages(b, price).join('\n\n');
}

/** Abertura das 08h às 10h, dividida em mensagens com disponibilidade real. */
export function earlyLunchMessages(b: Business, price: number): string[] {
  return [
    GREETING_MESSAGE,
    `${promotionMessage(b, price)}${b.highDemand ? '\n\nTemos pedidos limitados devido à alta demanda, então é melhor garantir a sua mais cedo, antes que acabe!' : ''}`,
    menuMessage(b),
    orderPrompt,
  ];
}

/** Abertura depois das 10h; não afirma escassez quando a opção está desativada. */
export function regularLunchMessages(b: Business, price: number): string[] {
  return [
    GREETING_MESSAGE,
    promotionMessage(b, price),
    ...(b.highDemand ? ['Hoje estamos tendo bastante pedidos e nossa cozinha está com uma movimentação muito grande.\n\nEstamos trabalhando com quantidade limitada, conforme a disponibilidade!'] : []),
    menuMessage(b),
    orderPrompt,
  ];
}

export const isEarlyLunch = (now = new Date()): boolean => {
  const time = spHM(now);
  return time >= '08:00' && time < '10:00';
};
export const lunchMenuOpen = (now = new Date()): boolean => {
  const time = spHM(now);
  return time >= '08:00' && time < '14:00';
};

export type BotWindow = 'lunch' | 'afterLunch' | 'night' | 'closed';
const spHM = (now: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
/** 08:00–14:20 pedidos de marmita · noite a partir das 17:00 · encerramento às 22:10. */
export function botWindow(now = new Date()): BotWindow {
  const t = spHM(now);
  if (t >= '08:00' && t < '14:20') return 'lunch';
  if (t >= '14:20' && t < '17:00') return 'afterLunch';
  if (t >= '17:00' && t < '22:10') return 'night';
  return 'closed';
}
/** Início (ISO) do período atual, para não repetir a mesma mensagem fixa no mesmo período. */
export function windowStart(now = new Date()): string {
  const w = botWindow(now); const t = spHM(now);
  const dayStart = (d: Date) => { const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); return new Date(`${s}T00:00:00-03:00`).getTime(); };
  const base = dayStart(now);
  const at = (hm: string, offsetDays = 0) => new Date(base + offsetDays * 86400000 + (Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3))) * 60000).toISOString();
  if (w === 'lunch') return at('08:00');
  if (w === 'afterLunch') return at('14:20');
  if (w === 'night') return at('17:00');
  return t >= '22:10' ? at('22:10') : at('22:10', -1);
}

/** Respostas predefinidas para dúvidas conhecidas; outras perguntas seguem para atendente. */
export function faqReply(text: string, b: Business, price: number, now = new Date()): string | null {
  const n = norm(text);
  const win = botWindow(now);
  if (/prazo|tempo de entrega|demora para entregar|demora pra entregar/.test(n)) return 'Nosso prazo estimado é de 30 a 45 minutos após o pedido sair para entrega.';
  if (/horario de saida|que horas.*(saem|sai)|comecam a sair|pedidos saem/.test(n)) return 'Nossos pedidos começam a sair a partir das 11:00.';
  if (/frete gratis|entrega gratis|entrega e gratis|taxa de entrega|valor da entrega/.test(n)) return b.freeDelivery ? 'Sim! A entrega é grátis para qualquer lugar de Eunápolis.' : null;
  if (/horario noturno|horario da noite|que horas.*(preparo|noite)|preparos comecam/.test(n)) return nightHoursReply(now);
  if (/ainda.*(aceita|aceitando)|aceita pedido|estao aceitando/.test(n)) {
    if (win === 'lunch') return 'Sim! Estamos recebendo pedidos de marmitas até as 14:20, conforme a disponibilidade da cozinha.';
    if (win === 'night') return 'Sim! O atendimento da noite segue até as 22:10, conforme a disponibilidade da cozinha.';
    return null;
  }
  if (win === 'lunch' && /preco|valor|quanto (custa|e|fica|sai)/.test(n) && /marmit|quentinh|almoco|hoje/.test(n)) return promotionMessage(b, price);
  if (/cardapio|menu|o que tem|o que voces tem|o que vcs tem/.test(n)) {
    if (win === 'lunch' && lunchMenuOpen(now)) return `Hoje temos ${b.lunchMenu}.`;
    if (win === 'night') return nightHoursReply(now);
    if (win === 'afterLunch') return LUNCH_CLOSED_MESSAGE;
  }
  return null;
}

const cap = (t: string) => t.trim().toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
export type Parsed = { draft: ConversationDraft; extracted: boolean; confirms: boolean; wantsHuman: boolean; greeting: boolean; thanks: boolean };
export type RulebotMessage = { direction: string; body: string | null; kind: string; wa_message_id: string | null; created_at: string };
/** Lê só a sequência atual: mensagens antigas não podem sobrescrever uma correção posterior. */
export function recentInboundChunks(messages: RulebotMessage[], currentId: string | undefined, since: string) {
  const current = messages.find(m => m.wa_message_id === currentId);
  const lastOut = messages.filter(m => m.direction === 'out' && (!current || m.created_at < current.created_at)).at(-1);
  const sinceMs = Date.parse(since);
  const chunks = messages.filter(m => m.direction === 'in' && m.kind === 'text' && Date.parse(m.created_at) >= sinceMs && (!lastOut || m.created_at > lastOut.created_at))
    .flatMap(m => (m.body ?? '').split(/\n+/)).map(s => s.trim()).filter(Boolean);
  return chunks.length ? chunks : current?.kind === 'text' ? (current.body ?? '').split(/\n+/).map(s => s.trim()).filter(Boolean) : [];
}

/** Extrai quantidade, nome, endereço e pagamento por palavras-chave/regex, preservando dados anteriores. */
export function ruleParse(text: string, prev: ConversationDraft, lunchProductId: string, missing: string[]): Parsed {
  const raw = text.trim(); const n = norm(raw);
  const d: ConversationDraft = { ...prev, items: prev.items.map(i => ({ ...i })), address: { ...prev.address } };
  let extracted = false;
  const simple = n.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const greeting = /^(?:(?:oi+|ola|opa|e ai|eai)(?: tudo bem)?|(?:(?:oi+|ola|opa) )?(?:bom dia|boa tarde|boa noite)(?: tudo bem)?)$/.test(simple);
  const thanks = /^(obrigad[oa]|obg|valeu|vlw|brigad[oa])( .*)?$/.test(simple);
  const wantsHuman = /\b(atendente|humano|falar com (alguem|uma pessoa|o dono|a dona)|reclama|reclamacao|cancelar|cancela|divergencia|pedido errado|problema com (pagamento|entrega)|nao recebi|atrasado)\b/.test(n);
  const confirms = /^(sim|s|isso|isso mesmo|pode|pode sim|pode confirmar|confirmo|confirma|confirmado|correto|certo|ta certo|tudo certo|esta certo|perfeito|ok|okay|beleza|blz|positivo|fechado|pode mandar)$/.test(simple);
  let qty: number | null = null;
  const m1 = /(\d{1,2})\s*(?:x\s*)?(?:marmit|quentinh|unidade)/.exec(n) ?? /\bquero\s+(\d{1,2})\b/.exec(n);
  const m2 = /\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:marmit|quentinh)/.exec(n);
  if (m1) qty = Number(m1[1]); else if (m2) qty = WORDS[m2[1] ?? ''] ?? null;
  else if (missing.includes('itens e quantidades')) {
    const q = /\b(?:quero|querer|seria|somente|so|apenas|manda|pode ser|vou de|sao|serao)\s+(?:somente\s+|so\s+|apenas\s+)?(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/.exec(simple)
      ?? /^(?:so |somente |apenas )?(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)(?: so| somente| apenas| por favor| pfv)?$/.exec(simple);
    if (q?.[1]) qty = /^\d+$/.test(q[1]) ? Number(q[1]) : WORDS[q[1]] ?? null;
  }
  if (qty === null && /^\d{1,2}$/.test(simple) && missing.includes('itens e quantidades')) qty = Number(simple);
  else if (/^(uma|duas|tres|quatro|cinco)$/.test(simple) && missing.includes('itens e quantidades')) qty = WORDS[simple] ?? null;
  if (qty && qty > 0 && qty <= 50 && lunchProductId) { d.items = [{ productId: lunchProductId, qty, note: '' }]; extracted = true; }
  if (/\bpix\b/.test(n)) d.payment = 'Pix';
  else if (/cart[a-z]*|credito|debito|maquin/.test(n) && /cartao|credito|debito|maquin/.test(n)) d.payment = 'Cartão';
  else if (/dinheiro|especie/.test(n)) d.payment = 'Dinheiro';
  if (d.payment !== prev.payment) extracted = true;
  if (d.payment === 'Dinheiro') {
    const tr = /troco\s*(?:pra|para|de)?\s*(?:r\$\s*)?(\d{1,4})/.exec(n);
    if (tr) { d.cashFor = Number(tr[1]); extracted = true; }
    else if (/sem troco|nao precis|nao vou precisar|trocado|valor certo|dinheiro certo/.test(n)) { d.cashFor = 0; extracted = true; }
    else if (missing.includes('troco (ou sem troco)') && /^(?:r\$\s*)?(\d{1,4})(?:,00)?$/.test(simple)) { d.cashFor = Number(simple.replace(/\D/g, '')); extracted = true; }
    else if (missing.includes('troco (ou sem troco)') && /^(nao|n)$/.test(simple)) { d.cashFor = 0; extracted = true; }
  }
  const nm = /(?:meu nome [eé]|meu nome eh|me chamo|nome:|aqui [eé] (?:o|a))\s+([a-zà-ú]+(?:\s+[a-zà-ú]+){0,3})/i.exec(raw.normalize('NFC'));
  const stop = /\s+(?:e|moro|vou|pago|quero|rua|av|avenida|no|na|pix|cart[aã]o|dinheiro)\b.*$/i;
  if (nm?.[1]) { const v = nm[1].replace(stop, '').trim(); if (validCustomerName(v)) { d.customer = cap(v); extracted = true; } }
  const reference = /(?:ponto de refer[eê]ncia|refer[eê]ncia)\s*:?\s*([^\n,;]+)/i.exec(raw);
  const refPhrase = reference ? null : /\b(?:quase\s+)?(?:em\s+frente\s+(?:a|à|ao|da|do)|ao\s+lado\s+(?:de|do|da)|perto\s+(?:de|do|da)|pr[oó]ximo\s+(?:a|à|ao|de|do|da)|atr[aá]s\s+(?:de|do|da))\b/i.exec(raw);
  // Endereço antes da referência ("Rua X, 225 Centauro, atrás da Prime Fit"): lê a rua e guarda só o trecho final como referência.
  const STREET = '(?:rua|r\\.?|av\\.?|avenida|travessa|tv\\.?|alameda|estrada|rodovia|loteamento|condominio|condomínio|praça|praca)';
  const addrBeforeRef = refPhrase && refPhrase.index > 0 && new RegExp(`\\b${STREET}\\s+[a-zà-ú0-9]`, 'i').test(raw.slice(0, refPhrase.index));
  const locationReference = !!refPhrase && !addrBeforeRef;
  const addrText = addrBeforeRef && refPhrase ? raw.slice(0, refPhrase.index).replace(/[\s,;\-–]+$/, '') : raw;
  if (reference?.[1]) { d.address.reference = reference[1].trim(); extracted = true; }
  else if (addrBeforeRef && refPhrase) { d.address.reference = raw.slice(refPhrase.index, refPhrase.index + 300).trim(); extracted = true; }
  else if (locationReference) { d.address.reference = raw.slice(0, 300); extracted = true; }
  const NUMW = '(\\d{1,5}[a-z]?|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez)';
  const houseNum = (v: string) => /^\d/.test(v) ? v : String(WORDS[norm(v)] ?? '');
  const addr = locationReference ? null : /\b(rua|r\.|r(?=\s+[a-zà-ú]{3})|av\.?|avenida|travessa|tv\.?|alameda|estrada|rodovia|loteamento|condominio|condomínio|praça|praca)\s+([^\n]+)/i.exec(addrText);
  if (addr) {
    const rest = `${addr[1]} ${addr[2]}`.replace(/\s*,?\s*(?:vou pagar|pago|pagamento|meu nome|me chamo|no pix|pix|cart[aã]o|dinheiro|ponto de refer[eê]ncia|refer[eê]ncia)\b.*$/i, '').trim();
    const bairro = /bairro:?\s*(?:(?:e|é|eh)\s+)?([^,.\n]+)/i.exec(rest) ?? /bairro:?\s*(?:(?:e|é|eh)\s+)?([^,.\n]+)/i.exec(raw);
    const cleaned = rest.replace(/[,\-–]?\s*bairro:?\s*[^,.\n]+/i, '').trim();
    const explicit = new RegExp(`(?:n[º°o.]?|casa|numero|número)\\s*${NUMW}\\b`, 'i').exec(cleaned);
    const comma = /,\s*(?:n[º°o.]?\s*|numero\s*|número\s*)?(\d{1,5}[a-z]?)\b/i.exec(cleaned);
    const digits = [...cleaned.matchAll(/\b(\d{1,5}[a-z]?)\b/gi)];
    const last = digits.at(-1);
    const numberedStreet = !explicit && !comma && digits.length === 1 && last && new RegExp(`^(?:rua|r\\.|av\\.?|avenida|travessa|tv\\.?)\\s*${last[0]}\\s+(?:de|da|do|dos|das)\\b`, 'i').test(cleaned);
    const num = explicit ?? comma ?? (numberedStreet ? null : last);
    let street = cleaned;
    if (num?.[1]) {
      d.address.number = houseNum(num[1]);
      street = cleaned.slice(0, num.index).replace(/[\s,]+$/, '');
    } else if (/\b(s\/n|sn|sem numero|sem número|n[aã]o tem n[uú]mero)\b/i.test(cleaned)) d.address.number = 'S/N';
    if (missing.includes('nome') && !validCustomerName(d.customer)) {
      const lead = addrText.slice(0, addr.index).trim().replace(/[,\-–]+$/, '').trim();
      if (/^[a-zà-ú]+(?:\s+[a-zà-ú]+){0,3}$/i.test(lead) && validCustomerName(lead)) d.customer = cap(lead);
    }
    d.address.street = street.replace(/[\s,\-–]+$/, '').slice(0, 200);
    const trailing = num?.[1] ? cleaned.slice((num.index ?? 0) + num[0].length).replace(/^[\s,\-–]+/, '').split(/[,.\n]/)[0]?.trim() : '';
    const neighborhood = bairro?.[1]?.trim() || trailing || '';
    if (neighborhood && (bairro?.[1] || validAddressField('neighborhood', neighborhood, d))) d.address.neighborhood = neighborhood;
    d.type = 'Delivery'; extracted = true;
  } else {
    const bairro = /bairro:?\s*(?:(?:e|é|eh)\s+)?([^,.\n]+)/i.exec(raw) ?? /^(?:no|na)\s+([a-zà-ú][a-zà-ú .'-]{1,58})$/i.exec(raw);
    if (bairro?.[1]) { d.address.neighborhood = bairro[1].trim(); d.type = 'Delivery'; extracted = true; }
  }
  if (/\b(retirar|retiro|vou buscar|buscar ai|buscar a[ií]|retirada)\b/.test(n)) { d.type = 'Retirada'; extracted = true; }
  if (!extracted && !confirms && !greeting && !thanks) {
    const hn = new RegExp(`^(?:casa|n|no|numero|e|e o)?\\s*${NUMW}$`).exec(simple);
    if (missing.includes('número') && /\b(sem numero|nao tem numero|nao possui numero|s n|sn)\b/.test(simple)) { d.address.number = 'S/N'; extracted = true; }
    else if (missing.includes('número') && hn?.[1] && houseNum(hn[1])) { d.address.number = houseNum(hn[1]); extracted = true; }
    else if (missing.includes('número') && /^(?:n[º°o.]?\s*)?(\d{1,5}[a-z]?)$/i.test(simple)) { d.address.number = simple.replace(/\D+$/, '').replace(/^\D+/, ''); extracted = true; }
    else if (missing.includes('bairro') && !missing.includes('rua') && !missing.includes('número') && /^[a-zà-ú0-9 .'-]{2,60}$/i.test(raw) && !/\d{3,}/.test(raw)) {
      const neighborhood = raw.replace(/^(?:bairro|no|na)\s+/i, '').trim();
      if (validAddressField('neighborhood', neighborhood, d)) { d.address.neighborhood = neighborhood; extracted = true; }
    }
    else if (missing.includes('nome') && !validCustomerName(d.customer) && /^[a-zà-ú]+(?:\s+[a-zà-ú]+){0,3}$/i.test(raw) && validCustomerName(raw)) { d.customer = cap(raw); extracted = true; }
  }
  if (d.address.street || d.address.neighborhood) { d.type = d.type ?? 'Delivery'; d.address.city = 'Eunápolis'; }
  return { draft: d, extracted, confirms, wantsHuman, greeting, thanks };
}
