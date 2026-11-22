import { GatewayError } from '@lovable.dev/ai-gateway';
// Delivery or lunch questions start the scripted lunch flow instead of a human handoff.
const LUNCH_INTEREST=/marmit|quentinh|almo[cç]o|comida|quero|pedido|pedir|card[aá]pio|hoje|entreg|delivery|frete|tele/i;
import { botWindow,windowStart,ruleParse,recentInboundChunks,GREETING_MESSAGE,nightOpeningMessage,AFTERNOON_MESSAGES,AFTERNOON_REMINDER_MESSAGE,AFTERNOON_REMINDER_DELAY_MS,isAfternoonMenuJob,isAfternoonReminderJob,CLOSING_MESSAGE,LUNCH_CLOSED_MESSAGE,HANDOFF_MESSAGE,CONFIRM_HINT,earlyLunchMessage,earlyLunchMessages,regularLunchMessages,lunchMenuOpen,faqReply,prefersManualOrder,isCatalogOrderMessage,FIRST_CONTACT_MESSAGE,FIRST_CONTACT_REMINDER_MESSAGE,FIRST_CONTACT_REMINDER_DELAY_MS,isFirstContactJob,isFirstContactReminderJob,ORDER_CONFIRMATION_REMINDER_DELAY_MS,isOrderConfirmationReminderJob,isStoreLocationQuestion,isStoreLocationJob,STORE_LOCATION_MESSAGE,STORE_LOCATION,STORE_LOCATION_MAPS_MESSAGE } from './whatsapp-rulebot';
import { z } from 'zod';
import { businessSchema,conversationDraftSchema,missingOrderFields,followUpMessage,lunchQtyAck,summaryReady,paymentLabel,addressAck,titleAddr,deliveryAddressComplete,customerNameWithProfile } from './whatsapp-business';
import { gateway,sendText,sendLocation,sendTyping,digits } from './whatsapp.server';
import { ATTACHMENT_ACK, ATTACHMENT_GROUP_MS, hasRecentReply } from './whatsapp-attachments';
import { ORDER_CONFIRMED_MESSAGE, isOrderConfirmationJob, canSendOrderConfirmation } from './whatsapp-confirmation';
import { pixPaymentMessage } from './whatsapp-payment';
import { STOCK_EXHAUSTED_MESSAGE, isStockExhaustedJob } from './whatsapp-stock-exhausted';
type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
type Job = {id:string;phone:string;kind:string;payload:unknown};
const jobPayload=z.object({text:z.string().max(4000).optional(),inboundId:z.string().optional(),orderId:z.string().nullable().optional(),requestId:z.string().optional(),pixPrompt:z.boolean().optional(),automatic:z.boolean().optional(),summaryVersion:z.number().int().optional(),summaryTotal:z.number().optional(),attendanceStartedAt:z.string().optional(),confirmationPrompt:z.boolean().optional(),confirmationReminder:z.boolean().optional(),location:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),name:z.string().min(1).max(200),address:z.string().min(1).max(500)}).optional()});
const check = <T>(r:{data:T;error:{message:string}|null}):NonNullable<T> => {if(r.error) throw new Error(r.error.message);if(r.data===null||r.data===undefined)throw new Error('Dados não encontrados');return r.data;};
const checkEmpty = <T>(r:{data:T;error:{message:string}|null}):T => {if(r.error)throw new Error(r.error.message);return r.data;};
export async function queueJob(db:Admin,key:string,phone:string,kind:'interpret'|'text'|'document'|'receipt',payload:Record<string,unknown>,options:{delayMs?:number}={}) {
  checkEmpty(await db.from('whatsapp_jobs').upsert({dedup_key:key,phone:digits(phone),kind,payload:payload as never,next_attempt_at:new Date(Date.now()+(options.delayMs??0)).toISOString()},{onConflict:'dedup_key',ignoreDuplicates:true}));
}
async function handoff(db:Admin,phone:string,reason:string,inboundId?:string,notify=false){
  // Silent pause: the customer never receives an automatic "vou encaminhar" message.
  void inboundId;void notify;
  checkEmpty(await db.from('whatsapp_conversations').update({automation_paused:true,automation_pause_reason:'human',order_confirmed_at:null,attendance_status:'needs_reply'}).eq('phone',phone));return reason;
}
export function brazilPhoneAlias(phone:string):string|null{
  if(/^55\d{2}9\d{8}$/.test(phone))return phone.slice(0,4)+phone.slice(5);
  if(/^55\d{2}[6-9]\d{7}$/.test(phone))return phone.slice(0,4)+'9'+phone.slice(4);
  return null;
}
async function interpret(db:Admin,j:Job){
  // Static/rule-based attendance: no AI generation calls in this flow.
  const payload=jobPayload.parse(j.payload);
  const cfg=check(await db.from('whatsapp_settings').select('business,auto_reply_enabled,account_state').eq('id',1).single());
  const b=businessSchema.parse(cfg.business??{});
  const c=check(await db.from('whatsapp_conversations').select('name,draft,draft_version,automation_paused,automation_pause_reason,order_confirmed_at,last_inbound_at,attendance_started_at').eq('phone',j.phone).single());
  if(!cfg.auto_reply_enabled||cfg.account_state!=='ok')return;
  const messages=check(await db.from('whatsapp_messages').select('direction,body,kind,wa_message_id,created_at').eq('phone',j.phone).order('provider_at',{ascending:false}).limit(30)).reverse();
  const current=messages.find(m=>m.wa_message_id===payload.inboundId);
  const latestInbound=messages.filter(m=>m.direction==='in').at(-1);
  if(latestInbound?.wa_message_id!==payload.inboundId)return;
  const text=(current?.body??'').trim();
  if(isCatalogOrderMessage(text)){
    // O pedido já existe: cancela lembretes e não responde. Aceite, Pix e mensagens manuais não são automáticos.
    checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null,completed_at:new Date().toISOString()}).eq('phone',j.phone).eq('kind','text').eq('payload->>automatic','true').in('state',['pending','leased','unknown']));
    if(!c.automation_paused||c.automation_pause_reason!=='order_confirmed'||!c.order_confirmed_at){
      checkEmpty(await db.from('whatsapp_conversations').update({automation_paused:true,automation_pause_reason:'order_confirmed',order_confirmed_at:new Date().toISOString(),draft:{},draft_version:c.draft_version+1}).eq('phone',j.phone).eq('draft_version',c.draft_version));
    }
    return;
  }
  // Depois de qualquer pedido, só um novo atendimento iniciado pela equipe pode reabrir o robô.
  if(c.automation_paused)return;
  if(!c.last_inbound_at||Date.now()-Date.parse(c.last_inbound_at)>86400000)return;
  const now=new Date();const win=botWindow(now);const since=windowStart(now);
  const attendanceStartedAt=c.attendance_started_at??c.last_inbound_at;
  const sentSince=checkEmpty(await db.from('whatsapp_messages').select('body').eq('phone',j.phone).eq('direction','out').gte('created_at',since)) ?? [];
  const firstContactRows=checkEmpty(await db.from('whatsapp_messages').select('body').eq('phone',j.phone).eq('direction','out').eq('body',FIRST_CONTACT_MESSAGE).gte('created_at',attendanceStartedAt).limit(1)) ?? [];
  const firstContactSeen=firstContactRows.length>0||(!c.attendance_started_at&&sentSince.some(m=>m.body===FIRST_CONTACT_MESSAGE));
  const already=(t:string)=>sentSince.some(m=>(m.body??'').startsWith(t.slice(0,40)));
  if(isStoreLocationQuestion(text)){
    if(!already(STORE_LOCATION_MESSAGE)){
      const inbound=payload.inboundId??j.id;
      await queueJob(db,`store-location:${inbound}`,j.phone,'text',{text:STORE_LOCATION_MESSAGE,automatic:true,inboundId:payload.inboundId});
      await queueJob(db,`store-location-pin:${inbound}`,j.phone,'text',{text:STORE_LOCATION_MAPS_MESSAGE,location:STORE_LOCATION,automatic:true,inboundId:payload.inboundId},{delayMs:1000});
    }
    return;
  }
  if(b.stockExhausted){
    if(!already(STOCK_EXHAUSTED_MESSAGE))await queueJob(db,`stock-exhausted:${since}:${j.phone}`,j.phone,'text',{text:STOCK_EXHAUSTED_MESSAGE,automatic:true,inboundId:payload.inboundId});
    return;
  }
  const snapshot=check(await db.from('pdv_state').select('data').eq('id',1).single());
  const products=z.object({products:z.array(z.object({id:z.string(),name:z.string(),price:z.number(),stock:z.number().nullable(),active:z.boolean()}))}).parse(snapshot.data).products;
  const lunchP=products.find(p=>p.id===b.lunchProductId&&p.active&&p.price>0);
  const previous=conversationDraftSchema.parse(c.draft);
  const openReq=checkEmpty(await db.from('whatsapp_order_requests').select('id').eq('phone',j.phone).eq('status','awaiting_acceptance').limit(1));
  if(openReq?.length){await handoff(db,j.phone,'Cliente escreveu com pedido aguardando aceite');return;}
  const inProgress=previous.items.length>0||!!previous.address.street||!!previous.payment;
  const manualByChat=prefersManualOrder(text);
  const missingBefore=missingOrderFields(previous);
  // Lê a sequência atual sem reprocesar mensagens antigas nem sobrescrever correções do cliente.
  const chunks=previous.summarySent?[text]:recentInboundChunks(messages,payload.inboundId,since);
  let folded=previous;
  for(const chunk of chunks){folded=ruleParse(chunk,folded,lunchP?.id??'',missingOrderFields(folded)).draft;}
  const whole=ruleParse(text,previous,lunchP?.id??'',missingBefore);
  const foldedChanged=JSON.stringify(folded)!==JSON.stringify(previous);
  const parsed={...whole,draft:foldedChanged?folded:whole.draft,extracted:whole.extracted||foldedChanged};
  parsed.draft.customer=customerNameWithProfile(parsed.draft.customer,c.name);
  const previousTotal=Math.round(previous.items.reduce((sum,item)=>sum+(lunchP?.price??b.lunchPrice)*item.qty,0)*100)/100;
  const interactionConfirms=previous.summarySent&&summaryReady(previous,previousTotal)&&previous.quotedTotal===previousTotal;
  if(parsed.wantsHuman&&!interactionConfirms){await handoff(db,j.phone,'Cliente pediu atendente',payload.inboundId,true);return;}
  const say=async(key:string,t:string)=>queueJob(db,`${key}:${payload.inboundId}`,j.phone,'text',{text:t,automatic:true,inboundId:payload.inboundId});
  if(win==='afterLunch'){
    for(let i=0;i<AFTERNOON_MESSAGES.length;i++){
      const msg=AFTERNOON_MESSAGES[i];
      if(!msg||already(msg))continue;
      await queueJob(db,`campaign:${since}:afternoon:${i}:${j.phone}`,j.phone,'text',{text:msg,automatic:true,inboundId:payload.inboundId,attendanceStartedAt});
    }
    return;
  }
  if(win==='night'){
    const faq=faqReply(text,b,lunchP?.price??b.lunchPrice,now);
    if(faq){if(!already(faq))await say('night-faq',faq);return;}
    if(!inProgress&&!/marmit|quentinh/i.test(text)){
      const opening=nightOpeningMessage(now);
      if(!already(opening)){await say('night',opening);return;}
      await handoff(db,j.phone,'Cliente precisa de ajuda no atendimento da noite',payload.inboundId,true);return;
    }
    if(/marmit|quentinh/i.test(text)&&!inProgress){if(!already(LUNCH_CLOSED_MESSAGE))await say('lunch-closed',LUNCH_CLOSED_MESSAGE);return;}
    await handoff(db,j.phone,'Atendimento da noite precisa de contexto humano',payload.inboundId,true);return;
  }
  if(win==='closed'){
    if(!already(CLOSING_MESSAGE))await say('closing',CLOSING_MESSAGE);
    return;
  }
  if(!lunchP){await handoff(db,j.phone,'Marmita não configurada no PDV');return;}
  if(lunchP.stock!==null&&lunchP.stock<=0){await handoff(db,j.phone,'Disponibilidade da marmita precisa de conferência',payload.inboundId,true);return;}
  // A abertura pertence ao atendimento, não ao período: voltar a chamar não repete o link.
  // Conversas antigas sem início recebem a abertura somente se ainda não houver pedido em coleta.
  if(!inProgress&&!firstContactSeen&&(c.attendance_started_at||parsed.greeting)){
    if(!c.attendance_started_at)checkEmpty(await db.from('whatsapp_conversations').update({attendance_started_at:attendanceStartedAt}).eq('phone',j.phone).is('attendance_started_at',null));
    await queueJob(db,`first-contact:${attendanceStartedAt}:${j.phone}`,j.phone,'text',{text:FIRST_CONTACT_MESSAGE,automatic:true,inboundId:payload.inboundId,attendanceStartedAt});
    return;
  }
  // Depois do resumo válido, qualquer interação confirma exatamente o que foi apresentado.
  if(current&&current.kind!=='text'&&!interactionConfirms){await handoff(db,j.phone,'Mensagem com áudio ou mídia requer atendimento humano',payload.inboundId,true);return;}
  const faq=faqReply(text,b,lunchP.price,now);
  if(faq&&!parsed.extracted&&!interactionConfirms){if(!already(faq))await say('faq',faq);return;}
  const earlyMessage=earlyLunchMessage(b,lunchP.price);
  const earlyCampaign=earlyLunchMessages(b,lunchP.price);
  const regularCampaign=regularLunchMessages(b,lunchP.price);
  const campaignSeen=firstContactSeen||already(GREETING_MESSAGE)||already(earlyMessage)||earlyCampaign.some(already)||regularCampaign.some(already);
  const lunchInterest=parsed.greeting||manualByChat||LUNCH_INTEREST.test(text);
  if(!inProgress&&!campaignSeen&&!parsed.extracted&&!lunchInterest){await handoff(db,j.phone,'Mensagem não identificada pelo robô',payload.inboundId,true);return;}
  const d=interactionConfirms?previous:parsed.draft;
  const total=interactionConfirms?previousTotal:Math.round(d.items.reduce((s,i)=>s+lunchP.price*i.qty,0)*100)/100;
  if(d.payment==='Pix'&&!b.pixKey){await handoff(db,j.phone,'Chave Pix não configurada');return;}
  const missing=missingOrderFields(d);
  const changed=!interactionConfirms&&JSON.stringify({...d,summarySent:false,quotedTotal:0})!==JSON.stringify({...previous,summarySent:false,quotedTotal:0});
  if((parsed.confirms||interactionConfirms)&&previous.summarySent&&!changed&&summaryReady(d,total,missing)&&previous.quotedTotal===total){
    if(!d.payment)return;
    const req={customer:d.customer,type:d.type,items:d.items.map(i=>({...i,note:i.note||'',quotedPrice:lunchP.price})),note:['Origem: BOT AUTOMÁTICO',d.payment==='Cartão'&&d.type==='Delivery'?'Levar maquininha':'',`Pagamento: ${paymentLabel(d.payment,d.type==='Delivery')}`].filter(Boolean).join(' · '),delivery:{address:d.address,paymentMethod:d.payment,cashFor:d.cashFor??0,chargeDeliveryFee:false}};
    const rid=checkEmpty(await db.rpc('wa_confirm_request',{_phone:j.phone,_inbound_id:payload.inboundId??j.id,_version:c.draft_version,_total:total,_request:req}));
    if(!rid)return;
    // Staff acceptance is required before the order reaches the kitchen; acceptance queues the confirmation message.
    return;
  }
  let reply:string;
  const nextVersion=c.draft_version+1;
  let pendingSummary=false;
  d.summarySent=false;d.quotedTotal=0;
  if(summaryReady(d,total,missing)){
    if(previous.summarySent&&!changed){reply=CONFIRM_HINT;d.summarySent=true;d.quotedTotal=total;}
    else{
      const brl=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
      const qty=d.items[0]?.qty??0;
      const where=d.type==='Delivery'?[`${titleAddr(d.address.street)}, ${d.address.number} — ${titleAddr(d.address.neighborhood)}`,d.address.reference?`Referência: ${d.address.reference}`:''].filter(Boolean).join('\n'):'Retirada no local';
      const troco=d.payment==='Dinheiro'?(d.cashFor?` (troco para ${brl(d.cashFor)})`:' (sem troco)'):'';
      reply=`Perfeito! ❤️ Confira seu pedido:\n\nNome: ${d.customer}\nQuantidade: ${qty} marmita${qty>1?'s':''}\nValor unitário: ${brl(lunchP.price)}\nTotal: ${brl(total)}\nEndereço: ${where}\nPagamento: ${d.payment}${troco}\n\nEstá tudo certinho? Posso confirmar seu pedido?`;
      if(b.circuitPaused)pendingSummary=true;
      else{d.summarySent=true;d.quotedTotal=total;}
    }
  } else if(manualByChat&&!parsed.extracted){reply=`Sem problema! Vamos montar seu pedido por aqui. ${followUpMessage(missing)}`;}
  else if(parsed.thanks&&!parsed.extracted){reply='Imagina! 😊 '+followUpMessage(missing);}
  else if(!parsed.extracted&&!parsed.greeting&&inProgress&&previous.summarySent){reply=CONFIRM_HINT;}
  else if(!lunchMenuOpen(now)&&!parsed.extracted&&!parsed.greeting&&!inProgress&&campaignSeen&&!messages.slice(0,-1).every(m=>m.direction==='out'||m.wa_message_id===payload.inboundId)&&!LUNCH_INTEREST.test(text)){await handoff(db,j.phone,'Mensagem não identificada pelo robô',payload.inboundId,true);return;}
  else{
    const ack=d.items[0]&&!previous.items.length?`${lunchQtyAck(d.items[0].qty)} `:d.type==='Delivery'&&deliveryAddressComplete(d)&&!deliveryAddressComplete(previous)?`${addressAck(d.address)} `:'';
    const ask=missing.length>1?`Para finalizar, me fala ${missing.map(f=>f==='itens e quantidades'?'quantas marmitas':f==='entrega ou retirada'?'o endereço completo':f==='rua'?'a rua':f==='número'?'o número da casa':f==='forma de pagamento'?'a forma de pagamento (Pix, cartão ou dinheiro)':f==='troco (ou sem troco)'?'se precisa de troco':`o ${f}`).filter((v,i,a)=>a.indexOf(v)===i).join(', ').replace(/, ([^,]*)$/,' e $1')} 😊`:followUpMessage(missing);
    reply=`${ack}${ask}`.trim();
  }
  const updated=check(await db.from('whatsapp_conversations').update({draft:d,draft_version:nextVersion}).eq('phone',j.phone).eq('draft_version',c.draft_version).eq('automation_paused',false).select('phone'));
  if(!updated.length)return;
  const confirmationPrompt=summaryReady(d,total,missing);
  if(pendingSummary)await queueJob(db,`reply:${payload.inboundId}`,j.phone,'text',{text:reply,automatic:true,inboundId:payload.inboundId,summaryVersion:nextVersion,summaryTotal:total,confirmationPrompt});
  else await queueJob(db,`reply:${payload.inboundId}`,j.phone,'text',{text:reply,automatic:true,inboundId:payload.inboundId,...(confirmationPrompt?{summaryVersion:nextVersion,summaryTotal:total,confirmationPrompt:true}:{})});
}
export async function processJobs(db:Admin,limit=2){
  for(let n=0;n<limit;n++){
    const cfg=check(await db.from('whatsapp_settings').select('business,account_state,auto_reply_enabled').eq('id',1).single());
    // Receive attachments even when automatic replies are paused. Sending stays gated separately.
    const claimed=check(await db.rpc('wa_claim_job'));const j=claimed?.[0];if(!j)return;
    try{
      const p=jobPayload.parse(j.payload);
      const confirmation=isOrderConfirmationJob(j.dedup_key);
      const handoffNotice=j.dedup_key.startsWith('handoff:');
      const legacyLunchCampaign=j.dedup_key.startsWith('campaign:')&&!j.dedup_key.includes(':afternoon:');
      if(j.kind==='text'&&(legacyLunchCampaign||j.dedup_key.startsWith('menu-reminder:'))){
        checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null,completed_at:new Date().toISOString()}).eq('id',j.id));continue;
      }
      if(j.dedup_key.startsWith('receipt-ack:')){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null}).eq('id',j.id));continue;}
      const business=businessSchema.parse(cfg.business);
      if(p.automatic&&business.stockExhausted&&!['interpret','receipt'].includes(j.kind)&&!isStockExhaustedJob(j.dedup_key)&&!isStoreLocationJob(j.dedup_key)){
        checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null,completed_at:new Date().toISOString()}).eq('id',j.id));continue;
      }
      if(!['interpret','receipt'].includes(j.kind)&&(business.circuitPaused||cfg.account_state!=='ok')){
        checkEmpty(await db.from('whatsapp_jobs').update({state:'pending',lease_until:null,next_attempt_at:new Date(Date.now()+60000).toISOString()}).eq('id',j.id));continue;
      }
      if(p.orderId||p.requestId){
        const q=db.from('whatsapp_order_requests').select('status,id').eq(p.requestId?'id':'order_id',p.requestId??p.orderId??'');
        const target=checkEmpty(await q.maybeSingle());
        if((confirmation&&!canSendOrderConfirmation(target?.status))||target&&['rejected','cancelled'].includes(target.status)){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null}).eq('id',j.id));continue;}
        if(p.pixPrompt&&!confirmation){
          const snapshot=check(await db.from('pdv_state').select('data').eq('id',1).single());
          const orders=z.object({orders:z.array(z.object({id:z.string(),payments:z.array(z.unknown()).default([])}))}).parse(snapshot.data).orders;
          // Comprovante recebido antes do aceite não impede a chave; somente pagamento já baixado impede nova cobrança.
          if(orders.find(o=>o.id===p.orderId)?.payments.length){
            if(j.dedup_key.endsWith(':pix-key')){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null}).eq('id',j.id));continue;}
            p.text='Seu pedido está confirmado! 😊';
          }
        }
      }
      if(confirmation&&!p.orderId&&!p.requestId){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null}).eq('id',j.id));continue;}
      // Pedido do cardápio grava o celular com o 9; o WhatsApp do Brasil identifica a conversa sem ele (e vice-versa).
      const alias=brazilPhoneAlias(j.phone);
      if(alias){
        const own=checkEmpty(await db.from('whatsapp_conversations').select('last_inbound_at').eq('phone',j.phone).maybeSingle());
        if(!own?.last_inbound_at){
          const other=checkEmpty(await db.from('whatsapp_conversations').select('phone,last_inbound_at').eq('phone',alias).maybeSingle());
          if(other?.last_inbound_at){checkEmpty(await db.from('whatsapp_jobs').update({phone:alias}).eq('id',j.id));j.phone=alias;}
        }
      }
      const c=check(await db.from('whatsapp_conversations').select('automation_paused,automation_pause_reason,last_inbound_at,attendance_status,assigned_to,order_confirmed_at,draft,draft_version').eq('phone',j.phone).single());
      if(isOrderConfirmationReminderJob(j.dedup_key)){
        const currentDraft=conversationDraftSchema.safeParse(c.draft);
        if(c.order_confirmed_at||c.draft_version!==p.summaryVersion||!currentDraft.success||!currentDraft.data.summarySent){
          checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null,completed_at:new Date().toISOString()}).eq('id',j.id));continue;
        }
      }
      if((isFirstContactReminderJob(j.dedup_key)||isAfternoonReminderJob(j.dedup_key))&&c.order_confirmed_at){
        checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null,completed_at:new Date().toISOString()}).eq('id',j.id));continue;
      }
      const confirmedOrderIntake=j.kind==='interpret'&&c.automation_pause_reason==='order_confirmed';
      // Pausa órfã: pedido já recusado/cancelado e ninguém atendendo — o robô volta a responder.
      if(p.automatic&&c.automation_paused&&c.automation_pause_reason!=='order_confirmed'&&c.attendance_status==='new'&&!c.assigned_to){
        const open=checkEmpty(await db.from('whatsapp_order_requests').select('id').eq('phone',j.phone).eq('status','awaiting_acceptance').limit(1));
        if(!open?.length){checkEmpty(await db.from('whatsapp_conversations').update({automation_paused:false}).eq('phone',j.phone));c.automation_paused=false;}
      }
      if(p.automatic&&((c.automation_paused&&!handoffNotice&&!confirmedOrderIntake)||!cfg.auto_reply_enabled)){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled'}).eq('id',j.id));continue;}
      if(j.kind==='receipt'){const {processReceipt}=await import('./payment-receipts.server');await processReceipt(db,p.inboundId??'');}
      else if(j.kind==='interpret')await interpret(db,j);
      else{
        if(!c.last_inbound_at||Date.now()-Date.parse(c.last_inbound_at)>=86400000){
          checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',processing_error:'Janela de 24h encerrada; modelo aprovado necessário',lease_until:null,completed_at:new Date().toISOString()}).eq('id',j.id));
          continue;
        }
        const pre=checkEmpty(await db.from('whatsapp_messages').select('wa_message_id,status').eq('reply_to',j.id).maybeSingle());
        if(pre?.wa_message_id){checkEmpty(await db.from('whatsapp_jobs').update({state:'completed',provider_id:pre.wa_message_id,completed_at:new Date().toISOString()}).eq('id',j.id));continue;}
        if(pre)throw new Error('Envio anterior requer revisão');
        let providerId:string|undefined;
        if(j.kind==='text'){
          const text=confirmation?ORDER_CONFIRMED_MESSAGE:j.dedup_key.endsWith(':pix-key')?pixPaymentMessage(business.pixKey):p.text??'';
          if(p.automatic&&(j.dedup_key.startsWith('campaign:')||isFirstContactJob(j.dedup_key)||isFirstContactReminderJob(j.dedup_key)||isAfternoonReminderJob(j.dedup_key)||isOrderConfirmationReminderJob(j.dedup_key))&&p.inboundId){
            const latest=checkEmpty(await db.from('whatsapp_messages').select('wa_message_id').eq('phone',j.phone).eq('direction','in').order('provider_at',{ascending:false}).limit(1))??[];
            if(latest[0]?.wa_message_id!==p.inboundId){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null,completed_at:new Date().toISOString()}).eq('id',j.id));continue;}
          }
          if(p.automatic){
            const recent=checkEmpty(await db.from('whatsapp_messages').select('body,created_at,status').eq('phone',j.phone).eq('direction','out').gte('created_at',new Date(Date.now()-ATTACHMENT_GROUP_MS).toISOString()))??[];
            let duplicate=hasRecentReply(recent,text);
            if(text===ATTACHMENT_ACK&&p.inboundId){
              const inbound=checkEmpty(await db.from('whatsapp_messages').select('media_id,created_at').eq('wa_message_id',p.inboundId).maybeSingle());
              if(inbound?.media_id){
                const earlier=checkEmpty(await db.from('whatsapp_messages').select('wa_message_id').eq('phone',j.phone).eq('direction','in').eq('media_id',inbound.media_id).lt('created_at',inbound.created_at).limit(1));
                duplicate=duplicate||Boolean(earlier?.length);
              }
            }
            if(duplicate){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null,completed_at:new Date().toISOString()}).eq('id',j.id));continue;}
          }
          if(p.automatic){
            await sendTyping(j.phone,String(j.dedup_key??'').split(':').slice(1).join(':'));
            await new Promise(r=>setTimeout(r,j.dedup_key.startsWith('campaign:')?3000:1500+Math.min(1500,text.length*8)));
            const live=check(await db.from('whatsapp_conversations').select('automation_paused').eq('phone',j.phone).single());
            const liveCfg=check(await db.from('whatsapp_settings').select('business,auto_reply_enabled').eq('id',1).single());
            const liveStockExhausted=businessSchema.parse(liveCfg.business).stockExhausted;
            const wrongMode=!isStoreLocationJob(j.dedup_key)&&liveStockExhausted!==isStockExhaustedJob(j.dedup_key);
            if((live.automation_paused&&!handoffNotice)||!liveCfg.auto_reply_enabled||wrongMode){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null}).eq('id',j.id));continue;}
          }
          providerId=p.location
            ?await sendLocation(db,j.phone,p.location,{fallbackText:STORE_LOCATION_MAPS_MESSAGE,source:p.automatic?'auto':'pdv',replyTo:j.id})
            :await sendText(db,j.phone,text,{source:p.automatic?'auto':'pdv',replyTo:j.id,orderId:p.orderId??null});
          if(p.automatic&&p.inboundId&&p.attendanceStartedAt&&isFirstContactJob(j.dedup_key)&&!isFirstContactReminderJob(j.dedup_key)){
            await queueJob(db,`first-contact-reminder:${p.attendanceStartedAt}:${j.phone}`,j.phone,'text',{text:FIRST_CONTACT_REMINDER_MESSAGE,automatic:true,inboundId:p.inboundId,attendanceStartedAt:p.attendanceStartedAt},{delayMs:FIRST_CONTACT_REMINDER_DELAY_MS});
          }
          if(p.automatic&&p.inboundId&&p.attendanceStartedAt&&isAfternoonMenuJob(j.dedup_key)){
            await queueJob(db,`afternoon-reminder:${p.attendanceStartedAt}:${j.phone}`,j.phone,'text',{text:AFTERNOON_REMINDER_MESSAGE,automatic:true,inboundId:p.inboundId,attendanceStartedAt:p.attendanceStartedAt},{delayMs:AFTERNOON_REMINDER_DELAY_MS});
          }
          if(p.automatic&&p.inboundId&&p.confirmationPrompt&&p.summaryVersion!==undefined){
            await queueJob(db,`confirmation-reminder:${p.summaryVersion}:${j.phone}`,j.phone,'text',{text:CONFIRM_HINT,automatic:true,inboundId:p.inboundId,summaryVersion:p.summaryVersion,summaryTotal:p.summaryTotal,confirmationReminder:true},{delayMs:ORDER_CONFIRMATION_REMINDER_DELAY_MS});
          }
        }
        else{
          const b=businessSchema.parse(cfg.business);if(!b.pdfPath)throw new Error('Cadastre o PDF');
          const url=check(await db.storage.from('whatsapp-menu').createSignedUrl(b.pdfPath,300));
          const reserved=check(await db.from('whatsapp_messages').insert({phone:j.phone,direction:'out',kind:'document',body:'Cardápio PDF',source:'pdv',status:'sending',reply_to:j.id}).select('id').single());
          const r=await gateway('/messages',{method:'POST',body:{messaging_product:'whatsapp',to:j.phone,type:'document',document:{link:url.signedUrl,filename:'Cardapio-Ultrabrasa.pdf'}}});
          providerId=r?.messages?.[0]?.id;if(!providerId)throw new Error('WhatsApp não retornou identificador');
          checkEmpty(await db.from('whatsapp_messages').update({wa_message_id:providerId,status:'accepted'}).eq('id',reserved.id));checkEmpty(await db.rpc('wa_reconcile',{_id:providerId}));
        }
        checkEmpty(await db.from('whatsapp_jobs').update({provider_id:providerId??null}).eq('id',j.id));
        if(p.summaryVersion!==undefined){const draft=check(await db.from('whatsapp_conversations').select('draft').eq('phone',j.phone).single());checkEmpty(await db.from('whatsapp_conversations').update({draft:{...conversationDraftSchema.parse(draft.draft),summarySent:true,quotedTotal:p.summaryTotal??0}}).eq('phone',j.phone).eq('draft_version',p.summaryVersion).eq('automation_paused',false));}
      }
      checkEmpty(await db.from('whatsapp_jobs').update({state:'completed',completed_at:new Date().toISOString(),lease_until:null}).eq('id',j.id));
    }catch(e){
      const reason=e instanceof Error?e.message:String(e);
      const ambiguous=!['interpret','receipt'].includes(j.kind)||e instanceof GatewayError&&(e.outcome==='unknown'||['NetworkError','TimeoutError'].includes(e.name));
      checkEmpty(await db.from('whatsapp_jobs').update({state:ambiguous?'unknown':'failed',processing_error:reason.slice(0,1000),lease_until:null}).eq('id',j.id));
      // A recusa de moeda do provedor fica registrada no envio, mas não pausa o robô nem a conversa.
      if(j.kind!=='receipt'&&!/\b131042\b/.test(reason))await handoff(db,j.phone,reason);
      if(e instanceof GatewayError&&[402,403,429].includes(e.httpStatus??0)){
        const b=businessSchema.parse(cfg.business);checkEmpty(await db.from('whatsapp_settings').update({business:{...b,circuitPaused:true,circuitReason:reason.slice(0,500)}}).eq('id',1));return;
      }
    }
  }
}
