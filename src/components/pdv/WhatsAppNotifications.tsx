import {useEffect,useState} from 'react';
import {Bell,Volume2,BellOff,X,ShoppingBag,ReceiptText} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {brl} from '@/lib/pdv-store';
import {activateWhatsAppSound,acknowledgeOrderAlert,getRepeatSeconds,mountWhatsAppInbox,notifPermission,playWhatsAppSound,setRepeatSeconds,setWhatsAppSound,useWhatsAppOrderAlerts,useWhatsAppReceiptAlerts,type AlertConversation} from '@/lib/whatsapp-alerts';
const KEY='ultrabrasa-wa-sound';
const RECEIPT_DISMISSED_KEY='ultrabrasa-wa-dismissed-receipts';
export function WhatsAppNotifications({onOpen,onAccept,productName}:{onOpen:(phone:string)=>void;onAccept?:(requestId:string)=>void;productName?:(id:string)=>string}){
 const [arrival,setArrival]=useState<(AlertConversation&{kind?:string})|null>(null);const[enabled,setEnabled]=useState(false);const[volume,setVolume]=useState(.5);const[perm,setPerm]=useState('default');const[failed,setFailed]=useState(false);const[repeat,setRepeat]=useState(30);const[busy,setBusy]=useState(false);
 const orderAlerts=useWhatsAppOrderAlerts();const receiptAlerts=useWhatsAppReceiptAlerts();const[dismissedReceipts,setDismissedReceipts]=useState<Set<string>>(()=>{try{return new Set<string>(JSON.parse(localStorage.getItem(RECEIPT_DISMISSED_KEY)??'[]'));}catch{return new Set<string>();}});
 useEffect(()=>mountWhatsAppInbox(),[]);
 useEffect(()=>{setPerm(notifPermission());setRepeat(getRepeatSeconds());try{const v=JSON.parse(localStorage.getItem(KEY)??'{}');if(typeof v.volume==='number')setVolume(v.volume);}catch{}},[]);
 const save=(v:number)=>localStorage.setItem(KEY,JSON.stringify({volume:v}));
 useEffect(()=>{const arrived=(e:Event)=>setArrival((e as CustomEvent<AlertConversation&{kind?:string}>).detail);const open=(e:Event)=>onOpen((e as CustomEvent<string>).detail);window.addEventListener('whatsapp-arrival',arrived);window.addEventListener('whatsapp-open',open);return()=>{window.removeEventListener('whatsapp-arrival',arrived);window.removeEventListener('whatsapp-open',open);};},[onOpen]);
 async function test(kind?:'new'|'order'|'receipt'){const r=await activateWhatsAppSound(volume);setEnabled(r.sound);setFailed(!r.sound);setPerm(r.permission);if(r.sound&&kind)setTimeout(()=>playWhatsAppSound(kind),700);}
 const alert=orderAlerts[orderAlerts.length-1];
 const visibleReceipts=receiptAlerts.filter(r=>!dismissedReceipts.has(r.id));const receipt=visibleReceipts[0];
 const dismissReceipt=(id:string)=>setDismissedReceipts(prev=>{const next=new Set([...prev,id]);try{localStorage.setItem(RECEIPT_DISMISSED_KEY,JSON.stringify([...next].slice(-500)));}catch{}return next;});
 const clearReceiptNotifications=()=>setDismissedReceipts(prev=>{const next=new Set([...prev,...receiptAlerts.map(r=>r.id)]);try{localStorage.setItem(RECEIPT_DISMISSED_KEY,JSON.stringify([...next].slice(-500)));}catch{}return next;});
 async function acceptAlert(id:string){if(!onAccept)return;setBusy(true);try{await onAccept(id);acknowledgeOrderAlert(id);}finally{setBusy(false);}}
 return <div className="shrink-0 border-b px-3 py-1.5"><div className="flex flex-wrap items-center gap-2">
 <Button size="sm" variant={enabled?'ghost':'default'} onClick={()=>void test()}><Bell size={14}/>{enabled?'Testar de novo':'Ativar e testar notificações'}</Button>
 <span className={`text-xs ${enabled?'text-success':'text-muted-foreground'}`}>{enabled?'Som ativo':'Som desligado'}</span>
 <Button size="icon" variant="ghost" title={enabled?'Silenciar WhatsApp':'Ativar som do WhatsApp'} aria-label={enabled?'Silenciar WhatsApp':'Ativar som do WhatsApp'} onClick={()=>{if(enabled){setEnabled(false);setWhatsAppSound(false,volume);}else void test();}}>{enabled?<Volume2 size={15}/>:<BellOff size={15}/>}</Button>
 <input aria-label="Volume das notificações" type="range" min="0" max="1" step="0.1" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);save(v);setWhatsAppSound(enabled,v);}} className="w-20 accent-primary"/>
 {enabled&&<span className="flex items-center gap-1 text-xs text-muted-foreground">Testar:{(['new','order','receipt'] as const).map(k=><Button key={k} size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={()=>playWhatsAppSound(k)}>{k==='new'?'Conversa':k==='order'?'Pedido':'Comprovante'}</Button>)}</span>}
 {enabled&&<label className="flex items-center gap-1 text-xs text-muted-foreground">Repetir pedido:<select aria-label="Intervalo de repetição do alerta de pedido" className="field h-6 px-1 text-[11px]" value={repeat} onChange={e=>{const v=Number(e.target.value);setRepeat(v);setRepeatSeconds(v);}}><option value={15}>15 s</option><option value={30}>30 s</option><option value={60}>60 s</option></select></label>}
 {arrival&&arrival.kind!=='order'&&arrival.kind!=='receipt'&&<div role="alert" className="ml-auto flex min-w-0 items-center gap-2 border-l-4 border-success bg-success/10 pl-3 text-sm"><Button variant="ghost" size="sm" className="max-w-80 truncate" onClick={()=>{onOpen(arrival.phone);setArrival(null);}}><strong>{arrival.kind==='new'?'Novo atendimento · ':''}{arrival.name||`+${arrival.phone}`}</strong> · {arrival.last_message}</Button><Button variant="ghost" size="icon" title="Fechar aviso" aria-label="Fechar aviso" onClick={()=>setArrival(null)}><X size={14}/></Button></div>}
 </div>
 {receipt&&<div role="alert" className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border-2 border-warning bg-warning/15 p-2 text-sm"><ReceiptText size={18} className="shrink-0 text-warning"/><span className="min-w-0 flex-1"><strong>{receipt.recognized?'Comprovante recebido — conferir':'Arquivo recebido — verificar'}</strong> · {receipt.name||`+${receipt.phone}`}{visibleReceipts.length>1?` · e mais ${visibleReceipts.length-1}`:''}</span><Button size="sm" variant="outline" onClick={()=>onOpen(receipt.phone)}>Ver conversa</Button><Button size="sm" variant="ghost" onClick={()=>dismissReceipt(receipt.id)}>Dispensar</Button>{visibleReceipts.length>0&&<Button size="sm" variant="outline" onClick={clearReceiptNotifications}>Limpar notificações ({visibleReceipts.length})</Button>}</div>}
 {alert&&<div role="alert" className="fixed inset-x-0 top-4 z-[100] mx-auto w-[min(92vw,36rem)] animate-pulse rounded-lg border-2 border-foreground bg-warning p-4 text-foreground shadow-2xl">
  <div className="flex items-start gap-3"><ShoppingBag size={28} className="shrink-0"/><div className="min-w-0 flex-1">
   <p className="text-lg font-bold">🔔 NOVO PEDIDO CONFIRMADO!</p>
   <p className="text-sm font-semibold">{alert.code?`${alert.code} · `:''}{alert.name||`+${alert.phone}`}{orderAlerts.length>1?` · e mais ${orderAlerts.length-1} pedido(s)`:''}</p>
   {alert.items.length>0&&<p className="mt-1 text-sm">{alert.items.map(i=>`${i.qty} × ${productName?.(i.productId)??'item'}${i.note?` (${i.note})`:''}`).join(' · ')}</p>}
   <p className="mt-1 text-sm">Total {brl(alert.total)} · {alert.type??'Retirada'} · Pagamento: {alert.payment?`${alert.payment} (pendente)`:'a definir'}</p>
   <div className="mt-2 flex flex-wrap gap-2">
    <Button size="sm" variant="default" onClick={()=>{acknowledgeOrderAlert(alert.id);onOpen(alert.phone);}}>Ver pedido</Button>
    {onAccept&&<Button size="sm" variant="default" disabled={busy} onClick={()=>void acceptAlert(alert.id)}>Aceitar pedido</Button>}
    <Button size="sm" variant="ghost" onClick={()=>acknowledgeOrderAlert(alert.id)}>Silenciar</Button>
   </div>
  </div></div>
 </div>}
 {failed&&<p className="text-xs text-destructive">O som não pôde ser ativado neste aparelho. Clique na página e tente de novo; confira se o volume do computador está ligado.</p>}
 {perm==='denied'&&<p className="text-xs text-warning">Avisos do computador bloqueados. Clique no cadeado ao lado do endereço do site, em Notificações escolha “Permitir” e recarregue a página.</p>}
 {perm==='unsupported'&&<p className="text-xs text-muted-foreground">Este aparelho não mostra avisos fora da página; o som e o aviso na tela continuam funcionando.</p>}
 {enabled&&<p className="text-[11px] text-muted-foreground">Com o PDV aberto (mesmo minimizado) você recebe som e aviso. Com o PDV ou o programa fechado, não há alertas.</p>}
 </div>;
}
