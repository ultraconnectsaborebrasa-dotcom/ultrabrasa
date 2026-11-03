import {useEffect,useState} from 'react';
import {Bell,Volume2,BellOff,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {activateWhatsAppSound,mountWhatsAppInbox,setWhatsAppSound,type AlertConversation} from '@/lib/whatsapp-alerts';
export function WhatsAppNotifications({onOpen}:{onOpen:(phone:string)=>void}){
 const [arrival,setArrival]=useState<AlertConversation|null>(null);const[enabled,setEnabled]=useState(false);const[volume,setVolume]=useState(.5);
 useEffect(()=>mountWhatsAppInbox(),[]);
 useEffect(()=>{const arrived=(e:Event)=>setArrival((e as CustomEvent<AlertConversation>).detail);const open=(e:Event)=>onOpen((e as CustomEvent<string>).detail);window.addEventListener('whatsapp-arrival',arrived);window.addEventListener('whatsapp-open',open);return()=>{window.removeEventListener('whatsapp-arrival',arrived);window.removeEventListener('whatsapp-open',open);};},[onOpen]);
 return <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
 <Button size="sm" variant="ghost" onClick={()=>{void activateWhatsAppSound(volume).then(()=>setEnabled(true));}}><Bell size={14}/>Ativar e testar notificações</Button>
 <Button size="icon" variant="ghost" title={enabled?'Silenciar WhatsApp':'Ativar som do WhatsApp'} aria-label="Silenciar WhatsApp" onClick={()=>{const on=!enabled;setEnabled(on);setWhatsAppSound(on,volume);}}>{enabled?<Volume2 size={15}/>:<BellOff size={15}/>}</Button>
 <input aria-label="Volume das notificações" type="range" min="0" max="1" step="0.1" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);setWhatsAppSound(enabled,v);}} className="w-20 accent-primary"/>
 {arrival&&<div role="alert" className="ml-auto flex min-w-0 items-center gap-2 border-l-2 border-success pl-3 text-sm"><Button variant="ghost" size="sm" className="max-w-80 truncate" onClick={()=>{onOpen(arrival.phone);setArrival(null);}}>{arrival.name||`+${arrival.phone}`} · {arrival.last_message}</Button><Button variant="ghost" size="icon" title="Fechar aviso" onClick={()=>setArrival(null)}><X size={14}/></Button></div>}
 </div>;
}