import { z } from 'zod';

export const receiptEvidenceSchema = z.object({
  isPixReceipt: z.boolean(), state: z.enum(['completed','scheduled','pending','failed','unknown']),
  amount: z.number().positive().nullable(), recipient: z.string().nullable(),
  pixKey: z.string().nullable(), paidDate: z.string().nullable(), transactionId: z.string().nullable(),
});
export type ReceiptEvidence = z.infer<typeof receiptEvidenceSchema>;
export type ReceiptCandidate = { id: string; total: number; createdAt: string; status: string; payment: string; paid: boolean };
export function receiptLinkCandidate(candidates: ReceiptCandidate[]) {
  const active = candidates.filter(c => ['awaiting_acceptance','accepted'].includes(c.status) && !c.paid);
  return active.length === 1 ? active[0]?.id ?? null : null;
}
export function canRecordProvisional(e: ReceiptEvidence) {
  return e.isPixReceipt && ['completed','unknown'].includes(e.state);
}
export function receiptReply(linked: boolean, recognized: boolean, multiple = false) {
  if (linked && recognized) return 'Obrigado pelo comprovante! 😊 Já deixei anotado no seu pedido.';
  if (multiple) return 'Recebi seu arquivo! Qual é o número do pedido deste comprovante?';
  return 'Recebi seu arquivo! Vamos verificar por aqui e te responder 😊';
}
const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export function assessReceipt(e: ReceiptEvidence, candidates: ReceiptCandidate[], used: boolean, recipient: string, pixKey: string, now = new Date()) {
  if (used) return { compatible:false, requestId:null, reason:'Possível reutilização de comprovante' };
  if (!e.isPixReceipt || e.state !== 'completed') return { compatible:false, requestId:receiptLinkCandidate(candidates), reason:'Não é um comprovante legível de Pix concluído' };
  const options=candidates.filter(c=>c.payment==='Pix'&&!c.paid);
  // Never choose by amount alone when the customer has multiple unpaid orders.
  if(options.length!==1)return {compatible:false,requestId:null,reason:options.length>1?'Há mais de um pedido: informe o código do pedido':'Nenhum pedido Pix pendente identificado'};
  const c=options[0];
  if(!c)return {compatible:false,requestId:null,reason:'Pedido não identificado'};
  const fail=(reason:string)=>({compatible:false,requestId:c.id,reason});
  if(['rejected','cancelled'].includes(c.status))return fail('Pedido recusado/cancelado: resolver recebimento ou eventual reembolso');
  if(e.amount===null||Math.round(e.amount*100)!==Math.round(c.total*100))return fail('Valor ausente ou divergente');
  if(!e.recipient||normalized(e.recipient)!==normalized(recipient))return fail('Destinatário ausente ou divergente');
  if(e.pixKey&&normalized(e.pixKey)!==normalized(pixKey))return fail('Chave Pix divergente');
  if(!e.transactionId||!/^E\d{8}[A-Za-z0-9]{23}$/.test(e.transactionId))return fail('Identificador Pix ausente ou ilegível');
  if(!e.paidDate||!/^\d{4}-\d{2}-\d{2}$/.test(e.paidDate))return fail('Data ilegível');
  const calendar=(date:Date)=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value??'').join('-');};
  const today=calendar(now);
  const created=calendar(new Date(c.createdAt));
  if(e.paidDate!==today||e.paidDate<created)return fail('Data divergente: precisa de conferência');
  return {compatible:true,requestId:c.id,reason:'Comprovante compatível; recebimento bancário não verificado'};
}
export const paymentIsUnverified = (p: { verification?: string }) => p.verification === 'unverified';