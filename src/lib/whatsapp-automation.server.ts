import { GatewayError } from '@lovable.dev/ai-gateway';
// Delivery or lunch questions start the scripted lunch flow instead of a human handoff.
const LUNCH_INTEREST=/marmit|quentinh|almo[cç]o|comida|quero|pedido|pedir|card[aá]pio|hoje|entreg|delivery|frete|tele/i;
import { botWindow,windowStart,ruleParse,recentInboundChunks,GREETING_MESSAGE,NIGHT_MESSAGE,CLOSING_MESSAGE,LUNCH_CLOSED_MESSAGE,HANDOFF_MESSAGE,CONFIRM_HINT,earlyLunchMessage,earlyLunchMessages,regularLunchMessages,isEarlyLunch,lunchMenuOpen,faqReply } from './whatsapp-rulebot';
import { z } from 'zod';
import { businessSchema,conversationDraftSchema,missingOrderFields,followUpMessage,lunchQtyAck,summaryReady,paymentLabel,addressAck,titleAddr,deliveryAddressComplete,customerNameWithProfile } from './whatsapp-business';
import { gateway,sendText,sendTyping,digits } from './whatsapp.server';
import { ATTACHMENT_ACK, ATTACHMENT_GROUP_MS, hasRecentReply } from './whatsapp-attachments';
import { ORDER_CONFIRMED_MESSAGE, isOrderConfirmationJob, canSendOrderConfirmation } from './whatsapp-confirmation';
import { pixPaymentMessage } from './whatsapp-payment';
import { shouldResumeAfterConfirmedOrder } from './whatsapp-order-followup';
type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
type Job = {id:string;phone:string;kind:string;payload:unknown};
const jobPayload=z.object({text:z.string().max(4000).optional(),inboundId:z.string().optional(),orderId:z.string().nullable().optional(),requestId:z.string().optional(),pixPrompt:z.boolean().optional(),automatic:z.boolean().optional(),summaryVersion:z.number().int().optional(),summaryTotal:z.number().optional()});
const check = <T>(r:{data:T;error:{message:string}|null}):NonNullable<T> => {if(r.error) throw new Error(r.error.message);if(r.data===null||r.data===undefined)throw new Error('Dados não encontrados');return r.data;};
const checkEmpty = <T>(r:{data:T;error:{message:string}|null}):T => {if(r.error)throw new Error(r.error.message);return r.data;};
export async function queueJob(db:Admin,key:string,phone:string,kind:'interpret'|'text'|'document'|'receipt',payload:Record<string,unknown>) {
  checkEmpty(await db.from('whatsapp_jobs').upsert({dedup_key:key,phone:digits(phone),kind,payload:payload as never},{onConflict:'dedup_key',ignoreDuplicates:true}));
}
async function handoff(db:Admin,phone:string,reason:string,inboundId?:string,notify=false){
  // Silent pause: the customer never receives an automatic "vou encaminhar" message.
  void inboundId;void notify;
  checkEmpty(await db.from('whatsapp_conversations').update({automation_paused:true,automation_pause_reason:'human',order_confirmed_at:null,attendance_status:'needs_reply'}).eq('phone',phone));return reason;
}
async function interpret(db:Admin,j:Job){
  // Static/rule-based attendance: no AI generation calls in this flow.
  const payload=jobPayload.parse(j.payload);
  const cfg=check(await db.from('whatsapp_settings').select('business,auto_reply_enabled,account_state').eq('id',1).single());
  const b=businessSchema.parse(cfg.business??{});
  const c=check(await db.from('whatsapp_conversations').select('name,draft,draft_version,automation_paused,automation_pause_reason,order_confirmed_at,last_inbound_at').eq('phone',j.phone).single());
  if(!cfg.auto_reply_enabled||cfg.account_state!=='ok'||b.circuitPaused)return;
  const messages=check(await db.from('whatsapp_messages').select('direction,body,kind,wa_message_id,created_at').eq('phone',j.phone).order('provider_at',{ascending:false}).limit(30)).reverse();
  const current=messages.find(m=>m.wa_message_id===payload.inboundId);
  const latestInbound=messages.filter(m=>m.direction==='in').at(-1);
  if(latestInbound?.wa_message_id!==payload.inboundId)return;
  const text=(current?.body??'').trim();
  if(c.automation_paused){
    const newOrder=c.automation_pause_reason==='order_confirmed'&&c.order_confirmed_at&&shouldResumeAfterConfirmedOrder(text,c.order_confirmed_at,new Date());
    if(!newOrder)return;
    const resumed=check(await db.from('whatsapp_conversations').update({automation_paused:false,automation_pause_reason:null,order_confirmed_at:null,assigned_to:null,assigned_name:null,attendance_status:'new',awaiting_since:null,draft:{},draft_version:c.draft_version+1}).eq('phone',j.phone).eq('draft_version',c.draft_version).eq('automation_paused',true).eq('automation_pause_reason','order_confirmed').select('phone'));
    if(!resumed.length)return;
    c.automation_paused=false;c.automation_pause_reason=null;c.order_confirmed_at=null;c.draft={};c.draft_version+=1;
  }
  if(!c.last_inbound_at||Date.now()-Date.parse(c.last_inbound_at)>86400000)return;
  const now=new Date();const win=botWindow(now);const since=windowStart(now);
  const sentSince=checkEmpty(await db.from('whatsapp_messages').select('body').eq('phone',j.phone).eq('direction','out').gte('created_at',since)) ?? [];
  const already=(t:string)=>sentSince.some(m=>(m.body??'').startsWith(t.slice(0,40)));
  const snapshot=check(await db.from('pdv_state').select('data').eq('id',1).single());
  const products=z.object({products:z.array(z.object({id:z.string(),name:z.string(),price:z.number(),stock:z.number().nullable(),active:z.boolean()}))}).parse(snapshot.data).products;
  const lunchP=products.find(p=>p.id===b.lunchProductId&&p.active&&p.price>0);
  const previous=conversationDraftSchema.parse(c.draft);
  const openReq=checkEmpty(await db.from('whatsapp_order_requests').select('id').eq('phone',j.phone).eq('status','awaiting_acceptance').limit(1));
  if(openReq?.length){await handoff(db,j.phone,'Cliente escreveu com pedido aguardando aceite');return;}
  const inProgress=previous.items.length>0||!!previous.address.street||!!previous.payment;
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
  const say=async(key:string,t:string)=>queueJob(db,`${key}:${payload.inboundId}`,j.phone,'text',{text:t,automatic:true});
  if(win==='afterLunch'){
    if(!already(LUNCH_CLOSED_MESSAGE))await say('lunch-closed',LUNCH_CLOSED_MESSAGE);
    return;
  }
  if(win==='night'){
    const faq=faqReply(text,b,lunchP?.price??b.lunchPrice,now);
    if(faq){if(!already(faq))await say('night-faq',faq);return;}
    if(!inProgress&&!/marmit|quentinh/i.test(text)){
      if(!already(NIGHT_MESSAGE)){await say('night',NIGHT_MESSAGE);return;}
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
  // Depois do resumo válido, qualquer interação confirma exatamente o que foi apresentado.
  if(current&&current.kind!=='text'&&!interactionConfirms){await handoff(db,j.phone,'Mensagem com áudio ou mídia requer atendimento humano',payload.inboundId,true);return;}
  const faq=faqReply(text,b,lunchP.price,now);
  if(faq&&!parsed.extracted&&!interactionConfirms){if(!already(faq))await say('faq',faq);return;}
  const earlyMessage=earlyLunchMessage(b,lunchP.price);
  const earlyCampaign=earlyLunchMessages(b,lunchP.price);
  const regularCampaign=regularLunchMessages(b,lunchP.price);
  const campaignSeen=already(GREETING_MESSAGE)||already(earlyMessage)||earlyCampaign.some(already)||regularCampaign.some(already);
  const lunchInterest=parsed.greeting||LUNCH_INTEREST.test(text);
  if(!inProgress&&!campaignSeen&&!parsed.extracted&&!lunchInterest){await handoff(db,j.phone,'Mensagem não identificada pelo robô',payload.inboundId,true);return;}
  // Split the opening; do not restart legacy or split campaigns at the boundary.
  if(lunchMenuOpen(now)&&!inProgress&&!campaignSeen&&!parsed.extracted){
    const campaign=isEarlyLunch(now)?earlyCampaign:regularCampaign;
    for(let i=0;i<campaign.length;i++){
      const msg=campaign[i];
      if(!msg)continue;
      const dup=checkEmpty(await db.from('whatsapp_messages').select('id').eq('phone',j.phone).eq('direction','out').gte('created_at',since).like('body',`${msg.slice(0,30)}%`).limit(1));
      if(dup?.length)continue;
      await queueJob(db,`campaign:${since}:${isEarlyLunch(now)?'early:':''}${i}:${j.phone}`,j.phone,'text',{text:msg,automatic:true,inboundId:payload.inboundId});
    }
    if(!parsed.extracted)return;
  }
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
  d.summarySent=false;d.quotedTotal=0;
  if(summaryReady(d,total,missing)){
    if(previous.summarySent&&!changed){reply=CONFIRM_HINT;d.summarySent=true;d.quotedTotal=total;}
    else{
      const brl=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
      const qty=d.items[0]?.qty??0;
      const where=d.type==='Delivery'?[`${titleAddr(d.address.street)}, ${d.address.number} — ${titleAddr(d.address.neighborhood)}`,d.address.reference?`Referência: ${d.address.reference}`:''].filter(Boolean).join('\n'):'Retirada no local';
      const troco=d.payment==='Dinheiro'?(d.cashFor?` (troco para ${brl(d.cashFor)})`:' (sem troco)'):'';
      reply=`Perfeito! ❤️ Confira seu pedido:\n\nNome: ${d.customer}\nQuantidade: ${qty} marmita${qty>1?'s':''}\nValor unitário: ${brl(lunchP.price)}\nTotal: ${brl(total)}\nEndereço: ${where}\nPagamento: ${d.payment}${troco}\n\nEstá tudo certinho? Posso confirmar seu pedido?`;
      d.summarySent=true;d.quotedTotal=total;
    }
  } else if(parsed.thanks&&!parsed.extracted){reply='Imagina! 😊 '+followUpMessage(missing);}
  else if(!parsed.extracted&&!parsed.greeting&&inProgress&&previous.summarySent){reply=CONFIRM_HINT;}
  else if(!lunchMenuOpen(now)&&!parsed.extracted&&!parsed.greeting&&!inProgress&&campaignSeen&&!messages.slice(0,-1).every(m=>m.direction==='out'||m.wa_message_id===payload.inboundId)&&!LUNCH_INTEREST.test(text)){await handoff(db,j.phone,'Mensagem não identificada pelo robô',payload.inboundId,true);return;}
  else{
    const ack=d.items[0]&&!previous.items.length?`${lunchQtyAck(d.items[0].qty)} `:d.type==='Delivery'&&deliveryAddressComplete(d)&&!deliveryAddressComplete(previous)?`${addressAck(d.address)} `:'';
    const ask=missing.length>1?`Para finalizar, me fala ${missing.map(f=>f==='itens e quantidades'?'quantas marmitas':f==='entrega ou retirada'?'o endereço completo':f==='rua'?'a rua':f==='número'?'o número da casa':f==='forma de pagamento'?'a forma de pagamento (Pix, cartão ou dinheiro)':f==='troco (ou sem troco)'?'se precisa de troco':`o ${f}`).filter((v,i,a)=>a.indexOf(v)===i).join(', ').replace(/, ([^,]*)$/,' e $1')} 😊`:followUpMessage(missing);
    reply=`${ack}${ask}`.trim();
  }
  const updated=check(await db.from('whatsapp_conversations').update({draft:d,draft_version:c.draft_version+1}).eq('phone',j.phone).eq('draft_version',c.draft_version).eq('automation_paused',false).select('phone'));
  if(!updated.length)return;
  await say('reply',reply);
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
      if(j.dedup_key.startsWith('receipt-ack:')){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null}).eq('id',j.id));continue;}
      if(j.kind!=='receipt'&&(businessSchema.parse(cfg.business).circuitPaused||cfg.account_state!=='ok')){
        checkEmpty(await db.from('whatsapp_jobs').update({state:'pending',lease_until:null,next_attempt_at:new Date(Date.now()+60000).toISOString()}).eq('id',j.id));continue;
      }
      if(p.orderId||p.requestId){
        const q=db.from('whatsapp_order_requests').select('status,id').eq(p.requestId?'id':'order_id',p.requestId??p.orderId??'');
        const target=checkEmpty(await q.maybeSingle());
        if((confirmation&&!canSendOrderConfirmation(target?.status))||target&&['rejected','cancelled'].includes(target.status)){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null}).eq('id',j.id));continue;}
        if(p.pixPrompt&&!confirmation){
          const receipts=checkEmpty(await db.from('payment_receipts').select('id').eq('phone',j.phone).in('state',['review','unverified','confirmed']).limit(1));
          const snapshot=check(await db.from('pdv_state').select('data').eq('id',1).single());
          const orders=z.object({orders:z.array(z.object({id:z.string(),payments:z.array(z.unknown()).default([])}))}).parse(snapshot.data).orders;
          if(receipts?.length||orders.find(o=>o.id===p.orderId)?.payments.length){
            if(j.dedup_key.endsWith(':pix-key')){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null}).eq('id',j.id));continue;}
            p.text='Seu pedido está confirmado! 😊';
          }
        }
      }
      if(confirmation&&!p.orderId&&!p.requestId){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null}).eq('id',j.id));continue;}
      const c=check(await db.from('whatsapp_conversations').select('automation_paused,automation_pause_reason,last_inbound_at,attendance_status,assigned_to').eq('phone',j.phone).single());
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
        if(!c.last_inbound_at||Date.now()-Date.parse(c.last_inbound_at)>=86400000)throw new Error('Janela de 24h encerrada; modelo aprovado necessário');
        const pre=checkEmpty(await db.from('whatsapp_messages').select('wa_message_id,status').eq('reply_to',j.id).maybeSingle());
        if(pre?.wa_message_id){checkEmpty(await db.from('whatsapp_jobs').update({state:'completed',provider_id:pre.wa_message_id,completed_at:new Date().toISOString()}).eq('id',j.id));continue;}
        if(pre)throw new Error('Envio anterior requer revisão');
        let providerId:string|undefined;
        if(j.kind==='text'){
          const text=confirmation?ORDER_CONFIRMED_MESSAGE:j.dedup_key.endsWith(':pix-key')?pixPaymentMessage(businessSchema.parse(cfg.business).pixKey):p.text??'';
          if(p.automatic&&j.dedup_key.startsWith('campaign:')&&p.inboundId){
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
            if(live.automation_paused&&!handoffNotice){checkEmpty(await db.from('whatsapp_jobs').update({state:'cancelled',lease_until:null}).eq('id',j.id));continue;}
          }
          providerId=await sendText(db,j.phone,text,{source:p.automatic?'auto':'pdv',replyTo:j.id,orderId:p.orderId??null});
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
      if(j.kind!=='receipt')await handoff(db,j.phone,reason);
      if(e instanceof GatewayError&&[402,403,429].includes(e.httpStatus??0)){
        const b=businessSchema.parse(cfg.business);checkEmpty(await db.from('whatsapp_settings').update({business:{...b,circuitPaused:true,circuitReason:reason.slice(0,500)}}).eq('id',1));return;
      }
    }
  }
}
