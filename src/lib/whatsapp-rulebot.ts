import type { ConversationDraft } from './whatsapp-business';

/** Bot tradicional (sem IA): textos fixos, janelas de horário e extração por regras. */
export const LUNCH_CAMPAIGN = [
  'Olá, tudo bem? 😊 Nossa marmita está em promoção, apenas R$ 19,90 com frete grátis! Aproveite para garantir a sua.',
  'Hoje nosso cardápio está delicioso! 😋\n\nTemos carne assada e linguiça de frango assada, acompanhadas de arroz, farofa de feijão, macarrão e salada de alface.\n\nNossos pedidos são limitados devido à alta demanda, então aproveite porque acaba rapidinho!',
  'E aí, vamos garantir a sua? ❤️\n\nMe fala quantas marmitas você deseja, seu nome, endereço completo e a forma de pagamento.\n\nAssim já deixamos seu pedido organizado!',
] as const;
export const NIGHT_MESSAGE = 'Oi! Tudo bem? 😊 Que bom ter você por aqui! Hoje temos espetinhos, porções e hambúrgueres artesanais para deixar sua noite mais gostosa! 🔥\n\nE a entrega é por nossa conta para toda Eunápolis! 🛵\n\nÉ só clicar no catálogo, escolher o que você quer e finalizar seu pedido por lá 👇\n\nhttps://ultraconnectbrasa.com.br/cardapio';
export const CLOSING_MESSAGE = 'Infelizmente, hoje já encerramos nossos atendimentos! ❤️ Nossa demanda foi muito alta e todos os pedidos foram atendidos.\n\nAmanhã estaremos funcionando normalmente. Então, já garanta o seu pedido mais cedo para não ficar sem! 😋\n\nAgradecemos pela compreensão e preferência. Deus abençoe! 🙏';
export const CONFIRM_HINT = 'É só responder *SIM* para eu confirmar seu pedido 😊 Se quiser mudar algo, me fala o que corrigir.';

export type BotWindow = 'lunch' | 'afterLunch' | 'night' | 'closed';
const spHM = (now: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
/** 09:00–14:00 marmitas · 14:00–18:00 encerramento do almoço · 18:00–22:10 noite · demais horários encerrado. */
export function botWindow(now = new Date()): BotWindow {
  const t = spHM(now);
  if (t >= '09:00' && t < '14:00') return 'lunch';
  if (t >= '14:00' && t < '18:00') return 'afterLunch';
  if (t >= '18:00' && t < '22:10') return 'night';
  return 'closed';
}
/** Início (ISO) do período atual, para não repetir a mesma mensagem fixa no mesmo período. */
export function windowStart(now = new Date()): string {
  const w = botWindow(now); const t = spHM(now);
  const dayStart = (d: Date) => { const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); return new Date(`${s}T00:00:00-03:00`).getTime(); };
  const base = dayStart(now);
  const at = (hm: string, offsetDays = 0) => new Date(base + offsetDays * 86400000 + (Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3))) * 60000).toISOString();
  if (w === 'lunch') return at('09:00');
  if (w === 'afterLunch') return at('14:00');
  if (w === 'night') return at('18:00');
  return t >= '22:10' ? at('22:10') : at('22:10', -1);
}

const cap = (t: string) => t.trim().toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
export type Parsed = { draft: ConversationDraft; extracted: boolean; confirms: boolean; wantsHuman: boolean; greeting: boolean; thanks: boolean };

/** Extrai quantidade, nome, endereço e pagamento por palavras-chave/regex, preservando dados anteriores. */
export function ruleParse(text: string, prev: ConversationDraft, lunchProductId: string, missing: string[]): Parsed {
  const raw = text.trim(); const n = norm(raw);
  const d: ConversationDraft = { ...prev, items: prev.items.map(i => ({ ...i })), address: { ...prev.address } };
  let extracted = false;
  const simple = n.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const greeting = /^(oi+|ola|bom dia|boa tarde|boa noite|opa|e ai|eai|oi tudo bem|ola tudo bem)( tudo bem)?$/.test(simple);
  const thanks = /^(obrigad[oa]|obg|valeu|vlw|brigad[oa])( .*)?$/.test(simple);
  const wantsHuman = /\b(atendente|humano|falar com (alguem|uma pessoa|o dono|a dona)|reclama|reclamacao|cancelar|cancela)\b/.test(n);
  const confirms = /^(sim|s|isso|isso mesmo|pode|pode sim|pode confirmar|confirmo|confirma|confirmado|correto|certo|ta certo|tudo certo|esta certo|perfeito|ok|okay|beleza|blz|positivo|fechado|pode mandar)$/.test(simple);
  // Quantidade
  let qty: number | null = null;
  const m1 = /(\d{1,2})\s*(?:x\s*)?(?:marmit|quentinh|unidade)/.exec(n) ?? /\bquero\s+(\d{1,2})\b/.exec(n);
  const m2 = /\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:marmit|quentinh)/.exec(n);
  if (m1) qty = Number(m1[1]); else if (m2) qty = WORDS[m2[1]!] ?? null;
  else if (/^\d{1,2}$/.test(simple) && missing.includes('itens e quantidades')) qty = Number(simple);
  else if (/^(uma|duas|tres|quatro|cinco)$/.test(simple) && missing.includes('itens e quantidades')) qty = WORDS[simple] ?? null;
  if (qty && qty > 0 && qty <= 50 && lunchProductId) { d.items = [{ productId: lunchProductId, qty, note: '' }]; extracted = true; }
  // Pagamento
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
  // Nome
  const nm = /(?:meu nome [eé]|meu nome eh|me chamo|nome:|aqui [eé] (?:o|a))\s+([a-zà-ú]+(?:\s+[a-zà-ú]+){0,3})/i.exec(raw.normalize('NFC'));
  const stop = /\s+(?:e|moro|vou|pago|quero|rua|av|avenida|no|na|pix|cart[aã]o|dinheiro)\b.*$/i;
  if (nm) { const v = nm[1]!.replace(stop, '').trim(); if (v.length >= 2) { d.customer = cap(v); extracted = true; } }
  // Endereço
  const addr = /\b(rua|r\.|av\.?|avenida|travessa|tv\.?|alameda|estrada|rodovia|loteamento|condominio|condomínio|praça|praca)\s+([^\n]+)/i.exec(raw);
  if (addr) {
    let rest = `${addr[1]} ${addr[2]}`.replace(/\s*,?\s*(?:vou pagar|pago|pagamento|meu nome|me chamo|no pix|pix|cart[aã]o|dinheiro)\b.*$/i, '').trim();
    const bairro = /bairro:?\s*([^,.\n]+)/i.exec(rest) ?? /bairro:?\s*([^,.\n]+)/i.exec(raw);
    if (bairro) { d.address.neighborhood = bairro[1]!.trim(); rest = rest.replace(/[,\-–]?\s*bairro:?\s*[^,.\n]+/i, '').trim(); }
    const num = /(?:,|\s)\s*(?:n[º°o.]?\s*|numero\s*|número\s*)?(\d{1,5}[a-z]?)\b/i.exec(rest);
    let street = rest;
    if (num) { d.address.number = num[1]!; const after = rest.slice((num.index ?? 0) + num[0].length).replace(/^[\s,\-–]+/, '').trim(); street = rest.slice(0, num.index).replace(/[\s,]+$/, ''); if (after && !d.address.neighborhood) d.address.neighborhood = (after.split(/[,.\n]/)[0] ?? '').trim(); }
    else if (/\b(s\/n|sn|sem numero|sem número)\b/i.test(rest)) d.address.number = 'S/N';
    d.address.street = street.replace(/[\s,\-–]+$/, '').slice(0, 200); d.type = 'Delivery'; extracted = true;
  } else {
    const bairro = /bairro:?\s*([^,.\n]+)/i.exec(raw); if (bairro) { d.address.neighborhood = bairro[1]!.trim(); d.type = 'Delivery'; extracted = true; }
  }
  if (/\b(retirar|retiro|vou buscar|buscar ai|buscar a[ií]|retirada)\b/.test(n)) { d.type = 'Retirada'; extracted = true; }
  // Respostas curtas para o único dado que falta
  if (!extracted && !confirms && !greeting && !thanks) {
    const only = (k: string) => missing.length > 0 && missing[0] === k;
    if (missing.includes('número') && /^(?:n[º°o.]?\s*)?(\d{1,5}[a-z]?)$/i.test(simple)) { d.address.number = simple.replace(/\D+$/, '').replace(/^\D+/, ''); extracted = true; }
    else if (missing.includes('bairro') && !missing.includes('rua') && /^[a-zà-ú0-9 .'-]{2,60}$/i.test(raw) && !/\d{3,}/.test(raw)) { d.address.neighborhood = raw.replace(/^bairro\s*/i, '').trim(); extracted = true; }
    else if ((only('nome') || (missing.length === 1 && missing[0] === 'nome')) && /^[a-zà-ú]+(?:\s+[a-zà-ú]+){0,3}$/i.test(raw)) { d.customer = cap(raw); extracted = true; }
  }
  if (d.address.street || d.address.neighborhood) { d.type = d.type ?? 'Delivery'; d.address.city = 'Eunápolis'; }
  return { draft: d, extracted, confirms, wantsHuman, greeting, thanks };
}
