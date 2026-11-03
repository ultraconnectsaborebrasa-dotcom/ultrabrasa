import { z } from 'zod';

export const attendanceLabels = { new: 'Novos', needs_reply: 'Precisam de resposta', in_service: 'Em atendimento', waiting_customer: 'Aguardando cliente', finished: 'Finalizados' } as const;
export const businessSchema = z.object({
  lunchPrice: z.number().min(0.01).max(10000).default(19.9),
  lunchMenu: z.string().min(1).max(1000).default('churrasco de carne assada, linguiça de frango, arroz, salada, macarrão e farofa de feijão'),
  lunchProductId: z.string().max(100).default(''),
  freeDelivery: z.boolean().default(true),
  highDemand: z.boolean().default(true),
  demandText: z.string().max(300).default('A procura está alta! Quer deixar seu pedido adiantado?'),
  pixKey: z.string().max(200).default(''),
  pixRecipient: z.string().min(1).max(200).default('Ultraconnect LTDA'),
  autoReceiptPayment: z.boolean().default(false),
  pdfPath: z.string().max(300).default(''),
  reminderMinutes: z.number().int().min(1).max(120).default(5),
  advanceFrom: z.string().regex(/^\d{2}:\d{2}$/).default('10:00'),
  departureFrom: z.string().regex(/^\d{2}:\d{2}$/).default('11:00'),
  hours: z.array(z.object({ day: z.number().int().min(0).max(6), lunchEnd: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')), nightStart: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')), nightEnd: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')) })).max(7).default([]),
  acceptAdvanceOrders: z.boolean().default(true),
  circuitPaused: z.boolean().default(false),
  circuitReason: z.string().max(500).default(''),
});
export type Business = z.infer<typeof businessSchema>;
export const defaultBusiness = businessSchema.parse({});
export const addressSchema = z.object({ street: z.string().max(200).default(''), number: z.string().max(30).default(''), neighborhood: z.string().max(120).default(''), city: z.string().max(100).default(''), reference: z.string().max(300).default(''), complement: z.string().max(200).default('') });
export const conversationDraftSchema = z.object({ customer: z.string().max(120).default(''), items: z.array(z.object({ productId: z.string().max(100), qty: z.number().int().min(1).max(99), note: z.string().max(500).default('') })).max(30).default([]), type: z.enum(['Delivery','Retirada']).nullable().default(null), address: addressSchema.default({}), payment: z.enum(['Pix','Dinheiro','Cartão']).nullable().default(null), cashFor: z.number().min(0).max(100000).nullable().default(null), requestedTime: z.string().max(100).default(''), summarySent: z.boolean().default(false), quotedTotal: z.number().min(0).default(0) });
export type ConversationDraft = z.infer<typeof conversationDraftSchema>;
export function missingOrderFields(d: ConversationDraft) {
  const missing: string[] = [];
  if (!d.customer) missing.push('nome');
  if (!d.items.length) missing.push('itens e quantidades');
  if (!d.type) missing.push('entrega ou retirada');
  if (d.type === 'Delivery') { for (const [field,label] of [['street','rua'],['number','número'],['neighborhood','bairro']] as const) if (!d.address[field]) missing.push(label); }
  if (!d.payment) missing.push('forma de pagamento');
  if (d.payment === 'Dinheiro' && d.cashFor === null) missing.push('troco (ou sem troco)');
  return missing;
}
/** Endereço de entrega informado implica Delivery; evita repetir a pergunta do endereço. */
export function normalizeDraft(d: ConversationDraft): ConversationDraft {
  const out = { ...d, address: { ...d.address, city: 'Eunápolis' } };
  if (!out.type && (out.address.street || out.address.neighborhood)) out.type = 'Delivery';
  return out;
}
/** Resumo só com pedido válido: itens com quantidade, total do cadastro > 0, entrega/retirada, endereço e pagamento. */
export function summaryReady(d: ConversationDraft, total: number, missing = missingOrderFields(d)) {
  return missing.length === 0 && d.items.length > 0 && d.items.every(i => Number.isFinite(i.qty) && i.qty > 0 && !!i.productId)
    && Number.isFinite(total) && total > 0 && !!d.type && !!d.payment
    && (d.type !== 'Delivery' || !!(d.address.street && d.address.number && d.address.neighborhood));
}
export const inEunapolis = (city: string) => city.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase() === 'eunapolis';
export function businessPeriod(b: Business, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get = (type: string) => parts.find(p=>p.type===type)?.value ?? '';
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'));
  const time = `${get('hour')}:${get('minute')}`; const h = b.hours.find(h=>h.day===day);
  if (h?.lunchEnd && time>=b.advanceFrom && time<h.lunchEnd) return 'lunch';
  if (h?.nightStart && h.nightEnd && (h.nightEnd>h.nightStart ? time>=h.nightStart && time<h.nightEnd : time>=h.nightStart || time<h.nightEnd)) return 'night';
  return 'closed';
}
const spTime=(now:Date)=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
/** Apresentação da marmita (composição e preço antes de pedir quantidade); price deve vir do produto atual do PDV. */
export function initialLunchMessage(b: Business, now = new Date(), price = b.lunchPrice) {
  const brl=price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dep=b.departureFrom.replace(/^0?(\d+):00$/,'$1h');
  const before=spTime(now)<b.departureFrom;
  const delivery=[b.freeDelivery?'Entrega grátis para qualquer bairro de Eunápolis!':'',before?`As entregas começam a sair às ${dep}.`:''].filter(Boolean).join(' ');
  return `Hoje temos marmita com ${b.lunchMenu}, por ${brl} 😋${delivery?`\n\n${delivery}`:''}\n\nQuer deixar seu pedido adiantado? Me fala quantas marmitas e o bairro da entrega 😊`;
}
/** Detecta se a apresentação da marmita já foi enviada na conversa. */
export const lunchPresented = (outBodies: string[], b: Business) => outBodies.some(t => t.includes(b.lunchMenu) || /Hoje temos marmita|Nossa marmita/.test(t));
const qtyWords=['','Uma','Duas','Três','Quatro','Cinco','Seis','Sete','Oito','Nove','Dez'];
export const lunchQtyAck = (qty: number) => `${qtyWords[qty] ?? qty} marmita${qty>1?'s':''}, combinado! 😊`;
/** Pergunta curta só pelo que falta, em ordem natural: itens/endereço, pagamento, nome. */
export function followUpMessage(missing: string[]) {
  const has=(k:string)=>missing.includes(k);
  const addr=['rua','número','bairro'].filter(has);
  if(has('itens e quantidades'))return 'Quantas marmitas você vai querer?';
  if(addr.length===3||has('entrega ou retirada')&&!has('itens e quantidades'))return 'Me passa a rua, o número e o bairro da entrega.';
  if(addr.length===1&&addr[0]==='número')return 'Me passa só o número da casa.';
  if(addr.length===1&&addr[0]==='bairro')return 'Me passa só o bairro.';
  if(addr.length)return `Me passa ${addr.length===1?'só ':''}${addr.map(a=>a==='número'?'o número da casa':`o ${a}`).join(', ').replace(/, ([^,]*)$/,' e $1')}.`;
  if(has('forma de pagamento'))return 'Vai pagar no Pix, cartão ou dinheiro? 😊';
  if(has('troco (ou sem troco)'))return 'Precisa de troco? Se sim, pra quanto?';
  if(has('nome'))return 'E qual seu nome?';
  return 'Certo!';
}
/** Próximo dia com almoço, para avisar quando a marmita esgota. */
export function nextLunchInfo(b: Business, now = new Date()) {
  for(let offset=1;offset<8;offset++){
    const date=new Date(now.getTime()+offset*86400000);
    const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short'}).format(date));
    if(b.hours.find(h=>h.day===day)?.lunchEnd)return offset===1?`amanhã, a partir das ${b.advanceFrom}`:`${date.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long'})}, a partir das ${b.advanceFrom}`;
  }
  return null;
}
const spDay=(now:Date)=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short'}).format(now));
const hourLabel=(t:string)=>t.replace(/^0?(\d+):00$/,'$1h').replace(/^0?(\d+):([1-5]\d)$/,'$1h$2');
/** Pedido de cardápio fora da noite: fala o que vem na marmita e mantém o cardápio digital. */
export function menuOutsideNightMessage(b: Business, opts: { price: number; available: boolean; menuUrl: string; pdfOffer: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const brl = opts.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const next = nextLunchInfo(b, now);
  const lunchToday = !!b.hours.find(h => h.day === spDay(now))?.lunchEnd;
  const lead = opts.available
    ? `Nossa marmita vem com ${b.lunchMenu}. É ${brl}${b.freeDelivery ? ', com entrega grátis pra qualquer bairro de Eunápolis' : ''}.`
    : `Nossas marmitas de hoje já acabaram${next ? `, mas a próxima leva sai ${next}` : ''}.`;
  const when = opts.available && lunchToday && spTime(now) < b.departureFrom
    ? ` As entregas de hoje começam a sair às ${hourLabel(b.departureFrom)}.`
    : opts.available && next ? ` A próxima leva sai ${next}.` : '';
  return `${lead}${when}${opts.available ? '\n\nQuer deixar seu pedido adiantado? Me fala quantas marmitas e o bairro da entrega 😊' : ''}`;
}
/** Pergunta genérica por cardápio/menu, sem citar produto. */
export const isMenuAsk = (t: string) => /card[aá]pio|menu|op[çc][õo]es|o que (?:vocês|vcs|vai|tem)|o que tem/i.test(t);
/** Pedido específico do cardápio da noite (hambúrguer, espetinho, lanche). */
export const isNightMenuAsk = (t: string) => /hamb[uú]rguer|burg|espetinho|espeto|lanche|card[aá]pio da noite|\bnoite\b/i.test(t);
/** Link do cardápio da noite fora do horário, com o horário cadastrado. */
export function nightMenuOffHours(b: Business, menuUrl: string, now = new Date()) {
  const day = spDay(now); let d = day; let h = b.hours.find(x => x.day === d && x.nightStart);
  for (let i = 1; !h && i < 8; i++) { d = (day + i) % 7; h = b.hours.find(x => x.day === d && x.nightStart); }
  const when = h ? ` Ele fica disponível ${d === day ? 'hoje' : 'a partir'} das ${hourLabel(h.nightStart!)}${h.nightEnd ? ` às ${hourLabel(h.nightEnd)}` : ''}.` : '';
  return `O cardápio da noite (hambúrgueres e espetinhos) é este: ${menuUrl}${when}`;
}
/** Pergunta genérica por preço/faixa de preço, sem citar produto. */
export const isPriceAsk = (t: string) => /faixa de pre[çc]o|quanto (?:custa|[eé]|sai|fica)|pre[çc]os?\b|valores?\b/i.test(t);
/** Resposta curta de preço no almoço: só a marmita, sem listar a loja. */
export function lunchPriceMessage(price: number, freeDelivery = true) {
  const brl = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `A marmita completa sai por ${brl}!${freeDelivery ? ' E a entrega está grátis pra qualquer bairro de Eunápolis.' : ''}`;
}
/** Pedido de cardápio com a loja fechada: próxima abertura real; se for almoço, apresenta a marmita. */
export function closedMenuMessage(b: Business, opts: { price: number; menuUrl: string; pdfOffer: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const brl = opts.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const n = nextOpeningInfo(b, now);
  const greet = n && n.current < '12:00' ? 'Bom dia!' : 'Oi!';
  if (n && n.time === b.advanceFrom) {
    const when = n.offset === 0 ? `Hoje começamos às ${n.time}` : `Começamos ${/^(sábado|domingo)/.test(n.weekday) ? 'no' : 'na'} ${n.weekday}, às ${n.time}`;
    return `${greet} ${when}. Nossa marmita é ${brl} e vem com ${b.lunchMenu}.${b.acceptAdvanceOrders ? '\n\nQuer deixar seu pedido adiantado? Me passa a quantidade e o endereço com bairro e número.' : ''}`;
  }
  const back = n ? `Voltamos ${n.offset === 0 ? `hoje às ${n.time}` : `${/^(sábado|domingo)/.test(n.weekday) ? 'no' : 'na'} ${n.weekday}, às ${n.time}`}.` : 'No momento estamos fechados.';
  return `${greet} ${back}${b.acceptAdvanceOrders ? ' Se quiser, pode deixar seu pedido por aqui que a gente confirma quando abrir 😊' : ''}`;
}
export function nextOpening(b: Business, now = new Date()) {
  for(let offset=0;offset<8;offset++) {
    const date=new Date(now.getTime()+offset*86400000);
    const day=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short'}).format(date).replace(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/g,m=>String(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(m))));
    const current=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
    const h=b.hours.find(h=>h.day===day); const starts=[h?.lunchEnd?b.advanceFrom:'',h?.nightStart??''].filter(Boolean).sort();
    const start=starts.find(t=>offset>0||t>current);
    if(start) return `${date.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long'})} às ${start}`;
  }
  return null;
}
const SP='America/Sao_Paulo';
export function nextOpeningInfo(b: Business, now = new Date()) {
  const current=new Intl.DateTimeFormat('en-GB',{timeZone:SP,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  for(let offset=0;offset<8;offset++){
    const date=new Date(now.getTime()+offset*86400000);
    const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:SP,weekday:'short'}).format(date));
    const h=b.hours.find(h=>h.day===day);const starts=[h?.lunchEnd?b.advanceFrom:'',h?.nightStart??''].filter(Boolean).sort();
    const start=starts.find(t=>offset>0||t>current);
    if(start)return{offset,time:start,weekday:date.toLocaleDateString('pt-BR',{timeZone:SP,weekday:'long'}),current};
  }
  return null;
}
/** Mensagem acolhedora para loja fechada; usa horários reais e só oferece pedido antecipado se habilitado. */
export function closedMessage(b: Business, now = new Date()) {
  const n=nextOpeningInfo(b,now);
  const offer=b.acceptAdvanceOrders;
  if(!n)return 'Oi! Que bom receber sua mensagem 😊 No momento não estamos atendendo, mas assim que alguém da equipe estiver por aqui, a gente te responde.';
  if(n.offset===0&&n.current<n.time&&n.current<'12:00')return `Bom dia! Daqui a pouco começamos por aqui 😊 Abrimos às ${n.time}.${offer?' Quer adiantar seu pedido?':''}`;
  if(n.offset===0)return `Oi! Que bom receber sua mensagem 😊 Agora estamos com uma pausa, mas às ${n.time} a gente volta.${offer?' Se quiser, pode deixar seu pedido por aqui que a gente confirma quando abrir!':''}`;
  const when=n.offset===1?'amanhã':`${/^(sábado|domingo)/.test(n.weekday)?'no':'na'} ${n.weekday}`;
  return `Oi! Que bom receber sua mensagem 😊 Por hoje já encerramos, mas ${when}, a partir das ${n.time}, estamos de volta.${offer?' Se quiser, pode deixar seu pedido por aqui que a gente confirma quando abrir!':''}`;
}

const small=new Set(['de','da','das','do','dos','e']);
export const titleAddr=(t:string)=>t.trim().toLowerCase().split(/\s+/).map((w,i)=>i>0&&small.has(w)?w:w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
/** Confirma o endereço recém-completado antes de seguir para o próximo dado. */
export const addressAck=(a:{street:string;number:string;neighborhood:string})=>`Entrega na ${titleAddr(a.street)}, ${a.number.trim()}, ${titleAddr(a.neighborhood)}, combinado!`;
export const paymentLabel=(p:'Pix'|'Dinheiro'|'Cartão',delivery:boolean)=>p==='Pix'?'Pix — aguardando pagamento':p==='Cartão'?`Cartão${delivery?' na entrega':''} — a receber`:`Dinheiro${delivery?' na entrega':''} — a receber`;
/** Resumo final; só chamar quando summaryReady for verdadeiro. */
export function orderSummary(d: ConversationDraft, lines: {name:string;qty:number;price:number;note?:string}[], total: number, pixKey='') {
  const brl=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const delivery=d.type==='Delivery';
  const items=lines.map(l=>`${l.qty} ${l.name}${l.note?` (${l.note})`:''} — ${brl(l.price*l.qty)}`).join('\n');
  const where=delivery?`Entrega: ${titleAddr(d.address.street)}, ${d.address.number.trim()} — ${titleAddr(d.address.neighborhood)}`:'Retirada no local';
  const troco=d.payment==='Dinheiro'?(d.cashFor?` · troco para ${brl(d.cashFor)}`:' · sem troco'):'';
  return `Confere pra mim 😊\n\n${items}\n${where}\nPagamento: ${paymentLabel(d.payment!,delivery)}${troco}${delivery?'\nEntrega grátis':''}${d.requestedTime?`\nHorário solicitado: ${d.requestedTime} (a confirmar pela loja)`:''}\nTotal: ${brl(total)}${d.payment==='Pix'&&pixKey?`\nChave Pix: ${pixKey}`:''}\n\nPosso confirmar seu pedido?`;
}
