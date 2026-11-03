import { z } from 'zod';

export const receiptEvidenceSchema = z.object({
  isPixReceipt: z.boolean(), state: z.enum(['completed','scheduled','pending','failed','unknown']),
  amount: z.number().positive().nullable(), recipient: z.string().nullable(),
  pixKey: z.string().nullable(), paidDate: z.string().nullable(), transactionId: z.string().nullable(),
});
export type ReceiptEvidence = z.infer<typeof receiptEvidenceSchema>;
export type ReceiptCandidate = { id: string; total: number; createdAt: string; status: string; payment: string; paid: boolean };
const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export function assessReceipt(e: ReceiptEvidence, candidates: ReceiptCandidate[], used: boolean, recipient: string, pixKey: string, now = new Date()) {
  if (used) return { compatible:false, requestId:null, reason:'Possível reutilização de comprovante' };
  if (!e.isPixReceipt || e.state !== 'completed') return { compatible:false, requestId:null, reason:'Não é um comprovante legível de Pix concluído' };
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
  const today=now.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  const created=new Date(c.createdAt).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  if(e.paidDate!==today||e.paidDate<created)return fail('Data divergente: precisa de conferência');
  return {compatible:true,requestId:c.id,reason:'Comprovante compatível; recebimento bancário não verificado'};
}
export const paymentIsUnverified = (p: { verification?: string }) => p.verification === 'unverified';