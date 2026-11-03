import {useSyncExternalStore} from 'react';
import {supabase} from '@/integrations/supabase/client';
export type AlertConversation={phone:string;name:string|null;unread:number;last_message:string|null;last_inbound_at:string|null;attendance_status:string;awaiting_since:string|null};
export type OrderAlert={id:string;phone:string;name:string|null;code:string|null;total:number;items:{qty:number;productId:string;note:string|undefined}[];type:string|null;payment:string|null;createdAt:string};
export type ReceiptAlert={id:string;phone:string;name:string|null;receivedAt:string};
type RequestRow={id:string;phone:string;created_at:string;quoted_total:number;public_code:string|null;order_number:number|null;request:unknown};
let conversations:AlertConversation[]=[];let listeners=new Set<()=>void>();let timer:ReturnType<typeof setInterval>|undefined;let refs=0;let baseline=false;let loading=false;let pendingOrders=0;
let orderAlerts:OrderAlert[]=[];let receiptAlerts:ReceiptAlert[]=[];let acked=new Set<string>();let seenReceipts=new Set<string>();let lastRepeatAt=0;
let audio:AudioContext|undefined;let enabled=false;let volume=0.5;const lastSound=new Map<string,number>();const reminded=new Set<string>();let reminderMinutes=5;
const ACK_KEY='ultrabrasa-wa-acked';const REPEAT_KEY='ultrabrasa-wa-repeat';
const empty:AlertConversation[]=[];const emptyAlerts:OrderAlert[]=[];const emptyReceipts:ReceiptAlert[]=[];
const emit=()=>listeners.forEach(l=>l());
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export function useWhatsAppConversations(){return useSyncExternalStore(subscribe,()=>conversations,()=>empty);}
export function useWhatsAppPendingOrders(){return useSyncExternalStore(subscribe,()=>pendingOrders,()=>0);}
export function useWhatsAppOrderAlerts(){return useSyncExternalStore(subscribe,()=>orderAlerts,()=>emptyAlerts);}
export function useWhatsAppReceiptAlerts(){return useSyncExternalStore(subscribe,()=>receiptAlerts,()=>emptyReceipts);}
function loadAcked(){try{acked=new Set(JSON.parse(localStorage.getItem(ACK_KEY)??'[]'));}catch{acked=new Set();}}
function saveAcked(){try{localStorage.setItem(ACK_KEY,JSON.stringify([...acked].slice(-200)));}catch{}}
export function getRepeatSeconds(){try{const v=Number(localStorage.getItem(REPEAT_KEY));return [15,30,60].includes(v)?v:30;}catch{return 30;}}
export function setRepeatSeconds(s:number){try{localStorage.setItem(REPEAT_KEY,String(s));}catch{}}
export function acknowledgeOrderAlert(id:string){acked.add(id);saveAcked();orderAlerts=orderAlerts.filter(a=>a.id!==id);emit();}
export function pruneAcked(ackedIds:Set<string>,pendingIds:Set<string>){const next=new Set([...ackedIds].filter(id=>pendingIds.has(id)));return next;}
export function orderAlertFromRequest(r:RequestRow,name:string|null):OrderAlert{
 const req=(r.request??{}) as {type?:string|null;items?:{productId?:string;qty?:number;note?:string}[];delivery?:{paymentMethod?:string|null};payment?:string|null};
 return {id:r.id,phone:r.phone,name,code:r.public_code??(r.order_number?`#${r.order_number}`:null),total:r.quoted_total,type:req.type??null,payment:req.delivery?.paymentMethod??req.payment??null,createdAt:r.created_at,items:(req.items??[]).map(i=>({qty:i.qty??1,productId:i.productId??'',note:i.note}))};
}
export function shouldRepeatOrderSound(now:number,lastAt:number,repeatSec:number,unacked:number){return unacked>0&&now-lastAt>=repeatSec*1000;}
export function newReceipts<T extends {id:string}>(seen:Set<string>,rows:T[]):T[]{return rows.filter(r=>!seen.has(r.id));}
const tone=(f:number,start:number,len:number,level:number,type:OscillatorType='square')=>{if(!audio)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.connect(gain);gain.connect(audio.destination);const t=audio.currentTime+start;osc.frequency.value=f;gain.gain.setValueAtTime(volume*level,t);gain.gain.exponentialRampToValueAtTime(.001,t+len);osc.start(t);osc.stop(t+len);};
export function playWhatsAppSound(kind:'new'|'message'|'order'|'receipt'='new'){if(!enabled||!audio||volume<=0)return;if(kind==='order'){[0,.25,.5,.9,1.15,1.4,1.8,2.05,2.3].forEach((s,i)=>tone([523,659,784][i%3]!,s,.22,.35,'triangle'));return;}if(kind==='receipt'){[0,.2,.4,.75].forEach((s,i)=>tone([988,784,988,1319][i]!,s,.18,.3,'sine'));return;}if(kind==='new'){[0,.18,.36,.7,.88,1.06].forEach((s,i)=>tone(i%3===2?1320:i%3===1?1100:880,s,.16,.25));}else tone(660,0,.25,.08,'sine');}
export async function activateWhatsAppSound(v=0.5):Promise<{sound:boolean;permission:string}>{volume=v;try{audio??=new AudioContext();await audio.resume();}catch{enabled=false;return {sound:false,permission:notifPermission()};}enabled=audio.state==='running';if(enabled)playWhatsAppSound('new');if('Notification' in window&&Notification.permission==='default'){try{await Notification.requestPermission();}catch{}}
 if(enabled&&'Notification' in window&&Notification.permission==='granted'){try{new Notification('Ultrabrasa · teste',{body:'Notificações do WhatsApp ativas',tag:'wa-test'});}catch{}}
 return {sound:enabled,permission:notifPermission()};}
export function notifPermission(){return typeof window!=='undefined'&&'Notification' in window?Notification.permission:'unsupported';}
export function setWhatsAppSound(on:boolean,v:number){enabled=on;volume=v;}
function notify(title:string,body:string,tag:string,phone:string){if('Notification' in window&&Notification.permission==='granted'){try{const n=new Notification(title,{body,tag,requireInteraction:true});n.onclick=()=>{window.focus();window.dispatchEvent(new CustomEvent('whatsapp-open',{detail:phone}));n.close();};}catch{}}}
export async function refreshWhatsAppConversations(){
 if(loading)return;loading=true;
 try{const r=await supabase.from('whatsapp_conversations').select('phone,name,unread,last_message,last_inbound_at,attendance_status,awaiting_since').order('last_message_at',{ascending:false}).limit(200);if(r.error)throw r.error;
  const fresh=r.data;
  const nameOf=(phone:string)=>fresh.find(c=>c.phone===phone)?.name??null;
  const pending=await supabase.from('whatsapp_order_requests').select('id,phone,created_at,quoted_total,public_code,order_number,request').eq('status','awaiting_acceptance');
  if(!pending.error){
   const rows=pending.data as RequestRow[];
   acked=pruneAcked(acked,new Set(rows.map(x=>x.id)));
   const alerts=rows.map(x=>orderAlertFromRequest(x,nameOf(x.phone))).filter(a=>!acked.has(a.id)).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
   const grew=baseline&&alerts.length>orderAlerts.length;
   orderAlerts=alerts;pendingOrders=rows.length;
   if(grew){const first=alerts[alerts.length-1]!;playWhatsAppSound('order');lastRepeatAt=Date.now();window.dispatchEvent(new CustomEvent('whatsapp-arrival',{detail:{phone:first.phone,name:first.name,kind:'order',last_message:'Pedido fechado pelo robô — aguardando aceite'}}));notify('🔔 Novo pedido confirmado: '+(first.name||`+${first.phone}`),`Total ${first.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · aguardando aceite da loja`,`wa-order-${first.id}`,first.phone);}
   if(shouldRepeatOrderSound(Date.now(),lastRepeatAt,getRepeatSeconds(),alerts.length)){playWhatsAppSound('order');lastRepeatAt=Date.now();}
   for(const p of rows){const key='request:'+p.id;if(Date.now()-Date.parse(p.created_at)>reminderMinutes*60000&&!reminded.has(key)){reminded.add(key);playWhatsAppSound();window.dispatchEvent(new CustomEvent('whatsapp-arrival',{detail:{phone:p.phone,name:nameOf(p.phone),kind:'order',last_message:'Pedido aguardando aceite da loja'}}));}}}
  const receipts=await supabase.from('payment_receipts').select('id,phone,received_at').is('reviewed_at',null).order('received_at',{ascending:false}).limit(20);

  if(!receipts.error){
   const rows=receipts.data as {id:string;phone:string;received_at:string}[];
   if(!baseline)seenReceipts=new Set(rows.map(x=>x.id));
   else{const freshOnes=newReceipts(seenReceipts,rows);for(const x of freshOnes){seenReceipts.add(x.id);playWhatsAppSound('receipt');window.dispatchEvent(new CustomEvent('whatsapp-arrival',{detail:{phone:x.phone,name:nameOf(x.phone),kind:'receipt',last_message:'Comprovante recebido — conferir'}}));notify('🧾 Comprovante recebido: '+(nameOf(x.phone)||`+${x.phone}`),'Confira o comprovante no Caixa',`wa-receipt-${x.id}`,x.phone);}}
   receiptAlerts=rows.map(x=>({id:x.id,phone:x.phone,name:nameOf(x.phone),receivedAt:x.received_at}));
  }
  if(baseline){for(const c of fresh){const old=conversations.find(o=>o.phone===c.phone);if(c.last_inbound_at&&Date.parse(c.last_inbound_at)>(old?.last_inbound_at?Date.parse(old.last_inbound_at):0)&&Date.now()-Date.parse(c.last_inbound_at)<60000){
   const kind=c.attendance_status==='new'?'new':'message';if(Date.now()-(lastSound.get(c.phone)??0)>8000){playWhatsAppSound(kind);lastSound.set(c.phone,Date.now());}
   window.dispatchEvent(new CustomEvent('whatsapp-arrival',{detail:{...c,kind}}));
   if(document.hidden)notify((kind==='new'?'Novo atendimento: ':'')+(c.name||`+${c.phone}`),c.last_message??'Nova mensagem',`wa-${c.phone}`,c.phone);
  }}}
  baseline=true;conversations=fresh;emit();
  for(const c of fresh){if(c.attendance_status!=='waiting_customer'&&c.attendance_status!=='finished'&&c.awaiting_since&&Date.now()-Date.parse(c.awaiting_since)>reminderMinutes*60000){const key=c.phone+':'+c.awaiting_since;if(!reminded.has(key)){reminded.add(key);playWhatsAppSound();window.dispatchEvent(new CustomEvent('whatsapp-arrival',{detail:{...c,last_message:'Cliente aguardando resposta'}}));}}}
 }catch(e){console.error('WhatsApp inbox refresh failed');}finally{loading=false;}
}
export function mountWhatsAppInbox(){refs++;if(refs===1){baseline=false;loadAcked();seenReceipts=new Set();lastRepeatAt=0;void supabase.from('whatsapp_settings').select('business').eq('id',1).single().then(r=>{if(!r.error&&r.data.business&&typeof r.data.business==='object'&&!Array.isArray(r.data.business)&&typeof r.data.business['reminderMinutes']==='number')reminderMinutes=r.data.business['reminderMinutes'];});void refreshWhatsAppConversations();timer=setInterval(()=>void refreshWhatsAppConversations(),4000);}return()=>{refs--;if(refs===0){clearInterval(timer);timer=undefined;conversations=[];orderAlerts=[];receiptAlerts=[];baseline=false;emit();}};}
