import { z } from 'zod';

export const attendanceLabels = { new: 'Novos', needs_reply: 'Precisam de resposta', in_service: 'Em atendimento', waiting_customer: 'Aguardando cliente', finished: 'Finalizados' } as const;
export const businessSchema = z.object({
  lunchPrice: z.number().min(0.01).max(10000).default(19.9),
  lunchMenu: z.string().min(1).max(1000).default('carne assada, linguiça de frango, arroz, salada, macarrão e farofa de feijão'),
  lunchProductId: z.string().max(100).default(''),
  freeDelivery: z.boolean().default(true),
  highDemand: z.boolean().default(true),
  demandText: z.string().max(300).default('A procura está alta! Quer deixar seu pedido adiantado?'),
  pixKey: z.string().max(200).default(''),
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
  if (d.type === 'Delivery') { for (const [field,label] of [['street','rua'],['number','número'],['neighborhood','bairro'],['city','cidade']] as const) if (!d.address[field]) missing.push(label); }
  if (!d.payment) missing.push('forma de pagamento');
  if (d.payment === 'Dinheiro' && d.cashFor === null) missing.push('troco (ou sem troco)');
  return missing;
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
export function initialLunchMessage(b: Business) {
  return `Olá! 😋 Nossa marmita custa ${b.lunchPrice.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} e vem com ${b.lunchMenu}.\n\n${b.freeDelivery ? '🛵 Entrega grátis para qualquer bairro de Eunápolis! ' : ''}As entregas começam a sair às ${b.departureFrom}.\n\n${b.highDemand ? b.demandText+' ' : ''}Me envie quantas marmitas você quer e seu endereço completo com bairro e número.`;
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
