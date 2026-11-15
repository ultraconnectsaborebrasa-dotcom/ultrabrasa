import { receiptLinkCandidate, receiptEvidenceSchema, type ReceiptCandidate } from './payment-receipts';
import { downloadWhatsAppMedia } from './whatsapp.server';
type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
export async function processReceipt(db: Admin, messageId: string, retry = false) {
  const m=await db.from('whatsapp_messages').select('*').eq('wa_message_id',messageId).eq('direction','in').single();
  if(m.error)throw new Error(m.error.message);
  const exists=await db.from('payment_receipts').select('*').eq('message_id',m.data.id).maybeSingle();
  if(exists.error)throw new Error(exists.error.message);
  if(exists.data && (!retry || ['unverified','confirmed','corrected'].includes(exists.data.state))) {
    // Acknowledgment belongs to the inbound job, not receipt analysis or retries.
    return;
  }
  let path:string|null=exists.data?.storage_path??null,hash:string|null=exists.data?.file_hash??null;
  const evidence=receiptEvidenceSchema.parse({isPixReceipt:false,state:'unknown',amount:null,recipient:null,pixKey:null,paidDate:null,transactionId:null});
  let reason='Comprovante recebido — aguardando conferência manual';const compatible=false;let requestId:string|null=null;let candidates:ReceiptCandidate[]=[];
  const requests=await db.from('whatsapp_order_requests').select('*').eq('phone',m.data.phone).gte('created_at',new Date(Date.now()-2*86400000).toISOString());
  const snapshot=await db.from('pdv_state').select('data').eq('id',1).single();
  if(requests.error||snapshot.error)throw new Error('Não foi possível consultar o pedido');
  const orders=(snapshot.data.data as unknown as {orders:{id:string;payments:unknown[];status:string}[]}).orders;
  candidates=requests.data.map(r=>{const order=orders.find(o=>o.id===r.order_id);const req=r.request as unknown as {payment?:string;delivery?:{paymentMethod?:string}};return {id:r.id,total:r.quoted_total,createdAt:r.created_at,status:order?.status==='cancelado'?'cancelled':r.status,payment:req.delivery?.paymentMethod??req.payment??'',paid:!!order?.payments.length};});
  requestId=receiptLinkCandidate(candidates);
  try {
    if(!m.data.media_id)throw new Error('Arquivo indisponível');
    const media=await downloadWhatsAppMedia(m.data.media_id);
    const digest=await crypto.subtle.digest('SHA-256',media.bytes);
    hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
    path=`${m.data.id}.${media.mime==='application/pdf'?'pdf':media.mime==='image/png'?'png':'jpg'}`;
    const stored=await db.storage.from('payment-receipts').upload(path,media.bytes,{contentType:media.mime,upsert:true});
    if(stored.error)throw new Error(stored.error.message);
    const usedQuery=db.from('payment_receipts').select('id').eq('file_hash',hash);
    const used=await (exists.data?usedQuery.neq('id',exists.data.id):usedQuery).limit(1);
    if(used.error)throw new Error(used.error.message);
    if(used.data.length){reason='Possível reutilização de comprovante — conferir manualmente';requestId=null;}
  }catch (error) {
    // File recovery never interprets evidence or changes a payment.
    reason=`Arquivo recebido — verificar: ${error instanceof Error?error.message:'arquivo indisponível'}`.slice(0,1000);
  }
  let receiptId=exists.data?.id;
  if(receiptId){
    const saved=await db.from('payment_receipts').update({storage_path:path,file_hash:hash,evidence,transaction_id:evidence.transactionId,request_id:requestId,reason}).eq('id',receiptId).eq('state','review');
    if(saved.error)throw new Error(saved.error.message);
  }else{
    const saved=await db.rpc('record_payment_receipt_input',{_input:{message:m.data.id,path,hash,evidence,request:requestId,compatible,reason}});
    if(saved.error)throw new Error(saved.error.message);receiptId=saved.data;
  }
  if(!receiptId)throw new Error('Comprovante não registrado');
  const final=await db.from('payment_receipts').select('state,request_id,order_id,storage_path').eq('id',receiptId).single();
  if(final.error)throw new Error(final.error.message);
}