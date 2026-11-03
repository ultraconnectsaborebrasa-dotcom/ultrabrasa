import {useSyncExternalStore} from 'react';
import {supabase} from '@/integrations/supabase/client';
export type AlertConversation={phone:string;name:string|null;unread:number;last_message:string|null;last_inbound_at:string|null;attendance_status:string;awaiting_since:string|null};
let conversations:AlertConversation[]=[];let listeners=new Set<()=>void>();let timer:ReturnType<typeof setInterval>|undefined;let refs=0;let baseline=false;let loading=false;let pendingOrders=0;
let audio:AudioContext|undefined;let enabled=false;let volume=0.5;const lastSound=new Map<string,number>();const reminded=new Set<string>();let reminderMinutes=5;
const empty:AlertConversation[]=[];
const emit=()=>listeners.forEach(l=>l());
export function useWhatsAppConversations(){return useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},()=>conversations,()=>empty);}
export function useWhatsAppPendingOrders(){return useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},()=>pendingOrders,()=>0);}
const tone=(f:number,start:number,len:number,level:number,type:OscillatorType='square')=>{if(!audio)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.connect(gain);gain.connect(audio.destination);const t=audio.currentTime+start;osc.frequency.value=f;gain.gain.setValueAtTime(volume*level,t);gain.gain.exponentialRampToValueAtTime(.001,t+len);osc.start(t);osc.stop(t+len);};
export function playWhatsAppSound(kind:'new'|'message'='new'){if(!enabled||!audio||volume<=0)return;if(kind==='new'){[0,.18,.36,.7,.88,1.06].forEach((s,i)=>tone(i%3===2?1320:i%3===1?1100:880,s,.16,.25));}else tone(660,0,.25,.08,'sine');}
export async function activateWhatsAppSound(v=0.5){volume=v;enabled=true;audio??=new AudioContext();await audio.resume();playWhatsAppSound();if('Notification' in window&&Notification.permission==='default')await Notification.requestPermission();}
export function setWhatsAppSound(on:boolean,v:number){enabled=on;volume=v;}
export async function refreshWhatsAppConversations(){
 if(loading)return;loading=true;
 try{const r=await supabase.from('whatsapp_conversations').select('phone,name,unread,last_message,last_inbound_at,attendance_status,awaiting_since').order('last_message_at',{ascending:false}).limit(200);if(r.error)throw r.error;
 const fresh=r.data;
 const pending=await supabase.from('whatsapp_order_requests').select('id,phone,created_at').eq('status','awaiting_acceptance');
 if(!pending.error){if(baseline&&pending.data.length>pendingOrders){playWhatsAppSound();const first=pending.data[0];if(first)window.dispatchEvent(new CustomEvent('whatsapp-arrival',{detail:{phone:first.phone,name:fresh.find(c=>c.phone===first.phone)?.name??null,last_message:'Pedido aguardando aceite da loja'}}));}pendingOrders=pending.data.length;
 for(const p of pending.data){const key='request:'+p.id;if(Date.now()-Date.parse(p.created_at)>reminderMinutes*60000&&!reminded.has(key)){reminded.add(key);playWhatsAppSound();window.dispatchEvent(new CustomEvent('whatsapp-arrival',{detail:{phone:p.phone,name:fresh.find(c=>c.phone===p.phone)?.name??null,last_message:'Pedido aguardando aceite da loja'}}));}}}
 if(baseline){for(const c of fresh){const old=conversations.find(o=>o.phone===c.phone);if(c.last_inbound_at&&Date.parse(c.last_inbound_at)>(old?.last_inbound_at?Date.parse(old.last_inbound_at):0)&&Date.now()-Date.parse(c.last_inbound_at)<60000){
 const kind=c.attendance_status==='new'?'new':'message';if(Date.now()-(lastSound.get(c.phone)??0)>8000){playWhatsAppSound(kind);lastSound.set(c.phone,Date.now());}
 window.dispatchEvent(new CustomEvent('whatsapp-arrival',{detail:{...c,kind}}));
 if(document.hidden&&'Notification' in window&&Notification.permission==='granted'){const n=new Notification((kind==='new'?'Novo atendimento: ':'')+(c.name||`+${c.phone}`),{body:c.last_message??'Nova mensagem',tag:`wa-${c.phone}`});n.onclick=()=>{window.focus();window.dispatchEvent(new CustomEvent('whatsapp-open',{detail:c.phone}));n.close();};}
 }}}
 baseline=true;conversations=fresh;emit();
 for(const c of fresh){if(c.attendance_status!=='waiting_customer'&&c.attendance_status!=='finished'&&c.awaiting_since&&Date.now()-Date.parse(c.awaiting_since)>reminderMinutes*60000){const key=c.phone+':'+c.awaiting_since;if(!reminded.has(key)){reminded.add(key);playWhatsAppSound();window.dispatchEvent(new CustomEvent('whatsapp-arrival',{detail:{...c,last_message:'Cliente aguardando resposta'}}));}}}
 }catch(e){console.error('WhatsApp inbox refresh failed');}finally{loading=false;}
}
export function mountWhatsAppInbox(){refs++;if(refs===1){baseline=false;void supabase.from('whatsapp_settings').select('business').eq('id',1).single().then(r=>{if(!r.error&&r.data.business&&typeof r.data.business==='object'&&!Array.isArray(r.data.business)&&typeof r.data.business['reminderMinutes']==='number')reminderMinutes=r.data.business['reminderMinutes'];});void refreshWhatsAppConversations();timer=setInterval(()=>void refreshWhatsAppConversations(),4000);}return()=>{refs--;if(refs===0){clearInterval(timer);timer=undefined;conversations=[];baseline=false;emit();}};}