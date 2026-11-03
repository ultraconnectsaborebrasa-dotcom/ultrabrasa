import {useEffect,useState} from 'react';
import {Bell,Volume2,BellOff,X,ShoppingBag} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {activateWhatsAppSound,mountWhatsAppInbox,notifPermission,setWhatsAppSound,type AlertConversation} from '@/lib/whatsapp-alerts';
const KEY='ultrabrasa-wa-sound';
export function WhatsAppNotifications({onOpen}:{onOpen:(phone:string)=>void}){
 const [arrival,setArrival]=useState<(AlertConversation&{kind?:string})|null>(null);const[enabled,setEnabled]=useState(false);const[volume,setVolume]=useState(.5);const[perm,setPerm]=useState('default');const[failed,setFailed]=useState(false);
 useEffect(()=>mountWhatsAppInbox(),[]);
 useEffect(()=>{setPerm(notifPermission());try{const v=JSON.parse(localStorage.getItem(KEY)??'{}');if(typeof v.volume==='number')setVolume(v.volume);}catch{}},[]);
 const save=(v:number)=>localStorage.setItem(KEY,JSON.stringify({volume:v}));
 useEffect(()=>{const arrived=(e:Event)=>setArrival((e as CustomEvent<AlertConversation&{kind?:string}>).detail);const open=(e:Event)=>onOpen((e as CustomEvent<string>).detail);window.addEventListener('whatsapp-arrival',arrived);window.addEventListener('whatsapp-open',open);return()=>{window.removeEventListener('whatsapp-arrival',arrived);window.removeEventListener('whatsapp-open',open);};},[onOpen]);
 async function test(){const r=await activateWhatsAppSound(volume);setEnabled(r.sound);setFailed(!r.sound);setPerm(r.permission);}
 return <div className="shrink-0 border-b px-3 py-1.5"><div className="flex flex-wrap items-center gap-2">
 <Button size="sm" variant={enabled?'ghost':'default'} onClick={()=>void test()}><Bell size={14}/>{enabled?'Testar de novo':'Ativar e testar notificações'}</Button>
 <span className={`text-xs ${enabled?'text-success':'text-muted-foreground'}`}>{enabled?'Som ativo':'Som desligado'}</span>
 <Button size="icon" variant="ghost" title={enabled?'Silenciar WhatsApp':'Ativar som do WhatsApp'} aria-label={enabled?'Silenciar WhatsApp':'Ativar som do WhatsApp'} onClick={()=>{if(enabled){setEnabled(false);setWhatsAppSound(false,volume);}else void test();}}>{enabled?<Volume2 size={15}/>:<BellOff size={15}/>}</Button>
 <input aria-label="Volume das notificações" type="range" min="0" max="1" step="0.1" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);save(v);setWhatsAppSound(enabled,v);}} className="w-20 accent-primary"/>
 {arrival&&arrival.kind!=='order'&&<div role="alert" className="ml-auto flex min-w-0 items-center gap-2 border-l-4 border-success bg-success/10 pl-3 text-sm"><Button variant="ghost" size="sm" className="max-w-80 truncate" onClick={()=>{onOpen(arrival.phone);setArrival(null);}}><strong>{arrival.kind==='new'?'Novo atendimento · ':''}{arrival.name||`+${arrival.phone}`}</strong> · {arrival.last_message}</Button><Button variant="ghost" size="icon" title="Fechar aviso" aria-label="Fechar aviso" onClick={()=>setArrival(null)}><X size={14}/></Button></div>}
 </div>
 {arrival?.kind==='order'&&<div role="alert" className="fixed inset-x-0 top-4 z-[100] mx-auto flex w-[min(92vw,34rem)] animate-pulse items-center gap-3 rounded-lg border-2 border-foreground bg-warning p-4 text-foreground shadow-2xl"><ShoppingBag size={28} className="shrink-0"/><button className="min-w-0 flex-1 text-left" onClick={()=>{onOpen(arrival.phone);setArrival(null);}}><p className="text-lg font-bold">🛎️ Novo pedido fechado pelo robô!</p><p className="truncate text-sm">{arrival.name||`+${arrival.phone}`} · toque para aceitar e mandar à cozinha</p></button><Button variant="ghost" size="icon" title="Fechar aviso" aria-label="Fechar aviso" onClick={()=>setArrival(null)}><X size={18}/></Button></div>}
 {failed&&<p className="text-xs text-destructive">O som não pôde ser ativado neste aparelho. Clique na página e tente de novo; confira se o volume do computador está ligado.</p>}
 {perm==='denied'&&<p className="text-xs text-warning">Avisos do computador bloqueados. Clique no cadeado ao lado do endereço do site, em Notificações escolha “Permitir” e recarregue a página.</p>}
 {perm==='unsupported'&&<p className="text-xs text-muted-foreground">Este aparelho não mostra avisos fora da página; o som e o aviso na tela continuam funcionando.</p>}
 {enabled&&<p className="text-[11px] text-muted-foreground">Com o PDV aberto (mesmo minimizado) você recebe som e aviso. Com o PDV ou o programa fechado, não há alertas.</p>}
 </div>;
}
