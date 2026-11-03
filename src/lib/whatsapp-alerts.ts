import {useSyncExternalStore} from 'react';
import {supabase} from '@/integrations/supabase/client';
export type AlertConversation={phone:string;name:string|null;unread:number;last_message:string|null;last_inbound_at:string|null;attendance_status:string;awaiting_since:string|null};
let conversations:AlertConversation[]=[];let listeners=new Set<()=>void>();let timer:ReturnType<typeof setInterval>|undefined;let refs=0;let baseline=false;let loading=false;
let audio:AudioContext|undefined;let enabled=false;let volume=0.5;const lastSound=new Map<string,number>();
const empty:AlertConversation[]=[];
const emit=()=>listeners.forEach(l=>l());
export function useWhatsAppConversations(){return useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},()=>conversations,()=>empty);}
export function playWhatsAppSound(){if(!enabled||!audio)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.connect(gain);gain.connect(audio.destination);osc.frequency.value=880;gain.gain.setValueAtTime(volume*.12,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.35);osc.start();osc.stop(audio.currentTime+.35);}
export async function activateWhatsAppSound(v=0.5){volume=v;enabled=true;audio??=new AudioContext();await audio.resume();playWhatsAppSound();if('Notification' in window&&Notification.permission==='default')await Notification.requestPermission();}
export function setWhatsAppSound(on:boolean,v:number){enabled=on;volume=v;}
export async function refreshWhatsAppConversations(){
 if(loading)return;loading=true;
 try{const r=await supabase.from('whatsapp_conversations').select('phone,name,unread,last_message,last_inbound_at,attendance_status,awaiting_since').order('last_message_at',{ascending:false}).limit(200);if(r.error)throw r.error;
 const fresh=r.data;
 if(baseline){for(const c of fresh){const old=conversations.find(o=>o.phone===c.phone);if(c.last_inbound_at&&Date.parse(c.last_inbound_at)>(old?.last_inbound_at?Date.parse(old.last_inbound_at):0)&&Date.now()-Date.parse(c.last_inbound_at)<60000){
 if(Date.now()-(lastSound.get(c.phone)??0)>8000){playWhatsAppSound();lastSound.set(c.phone,Date.now());}
 window.dispatchEvent(new CustomEvent('whatsapp-arrival',{detail:c}));
 if(document.hidden&&'Notification' in window&&Notification.permission==='granted'){const n=new Notification(c.name||`+${c.phone}`,{body:c.last_message??'Nova mensagem',tag:`wa-${c.phone}`});n.onclick=()=>{window.focus();window.dispatchEvent(new CustomEvent('whatsapp-open',{detail:c.phone}));n.close();};}
 }}}
 baseline=true;conversations=fresh;emit();
 }catch(e){console.error('WhatsApp inbox refresh failed');}finally{loading=false;}
}
export function mountWhatsAppInbox(){refs++;if(refs===1){baseline=false;void refreshWhatsAppConversations();timer=setInterval(()=>void refreshWhatsAppConversations(),4000);}return()=>{refs--;if(refs===0){clearInterval(timer);timer=undefined;conversations=[];baseline=false;emit();}};}