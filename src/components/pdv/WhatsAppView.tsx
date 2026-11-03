import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, RefreshCw, CheckCheck, Check, AlertTriangle, Settings2, History, UserRound, FileText } from 'lucide-react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { brl, useStore, type Order } from '@/lib/pdv-store';
import { normalizePhone } from '@/lib/pdv-customers';
import { whatsappSend, whatsappStatus, whatsappSyncHistory } from '@/lib/whatsapp.functions';
import {businessSchema,attendanceLabels,type Business} from '@/lib/whatsapp-business';
import {whatsappAction,whatsappRequestAction,whatsappSendPdf} from '@/lib/whatsapp-attendance.functions';
import {WhatsAppBusinessSettings} from './WhatsAppBusinessSettings';
import {refreshWhatsAppConversations} from '@/lib/whatsapp-alerts';

type Conv = { phone: string; name: string | null; last_message: string | null; last_message_at: string; unread: number; last_inbound_at: string | null; attendance_status:string; assigned_name:string|null; automation_paused:boolean; awaiting_since:string|null };
type Msg = { id: string; direction: string; source: string; body: string | null; status: string; error: string | null; provider_at: string; order_id: string | null };
type Cfg = { auto_reply_enabled: boolean; auto_reply_text: string; quick_replies: string[]; account_state: string; account_event: string | null; business:Business };
type Status = Awaited<ReturnType<typeof whatsappStatus>>;

const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', cozinha: 'Em preparo', pronto: 'Pronto', pago: 'Pago', cancelado: 'Cancelado', entregue: 'Entregue' };

export function WhatsAppView({openPhone}:{openPhone?:string|null}) {
  const statusFn = useServerFn(whatsappStatus);
  const sendFn = useServerFn(whatsappSend);
  const syncFn = useServerFn(whatsappSyncHistory);
  const actionFn=useServerFn(whatsappAction);const requestFn=useServerFn(whatsappRequestAction);const pdfFn=useServerFn(whatsappSendPdf);
  const orders = useStore(s => s.orders);
  const [status, setStatus] = useState<Status | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [orderId, setOrderId] = useState<string>('');
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [showCfg, setShowCfg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter,setFilter]=useState('all');const[search,setSearch]=useState('');const[note,setNote]=useState('');
  const[notes,setNotes]=useState<{id:string;body:string;author_name:string|null}[]>([]);
  const[requests,setRequests]=useState<{id:string;phone:string;quoted_total:number;request:unknown;created_at:string}[]>([]);
  const[drafts,setDrafts]=useState<Record<string,string>>({});
  useEffect(()=>{try{setDrafts(JSON.parse(localStorage.getItem('ultrabrasa-wa-drafts')??'{}'));}catch{}},[]);
  useEffect(()=>{if(openPhone)setActive(openPhone);},[openPhone]);
  useEffect(()=>{if(active)setText(drafts[active]??'');},[active]);
  const write=(value:string)=>{setText(value);if(active){setDrafts(prev=>{const next={...prev,[active]:value};localStorage.setItem('ultrabrasa-wa-drafts',JSON.stringify(next));return next;});}};
  async function action(kind:'take'|'resume'|'read'|'waiting'|'finish'|'note'){if(!active)return;try{await actionFn({data:{phone:active,action:kind,body:kind==='note'?note:undefined}});if(kind==='note')setNote('');await loadConvs();await loadNotes(active);void refreshWhatsAppConversations();}catch(e){toast.error(e instanceof Error?e.message:'Falha');}}
  async function loadNotes(phone:string){const r=await supabase.from('whatsapp_notes').select('id,body,author_name').eq('phone',phone).order('created_at');if(!r.error)setNotes(r.data);}
  async function loadRequests(){const r=await supabase.from('whatsapp_order_requests').select('id,phone,quoted_total,request,created_at').eq('status','awaiting_acceptance').order('created_at');if(!r.error)setRequests(r.data);}
  async function accept(id:string,yes:boolean){setBusy(true);try{await requestFn({data:{id,accept:yes}});toast.success(yes?'Pedido aceito e enviado à cozinha':'Pedido recusado');await loadRequests();await loadConvs();}catch(e){toast.error(e instanceof Error?e.message:'Falha');}finally{setBusy(false);}}

  const checkStatus = () => statusFn().then(setStatus).catch(e => setStatus({ connected: false, reason: String(e?.message ?? e) }));
  const loadConvs = async () => { const r = await supabase.from('whatsapp_conversations').select('phone,name,last_message,last_message_at,unread,last_inbound_at,attendance_status,assigned_name,automation_paused,awaiting_since').order('last_message_at', { ascending: false }).limit(200); if (!r.error) setConvs(r.data); };
  const loadMsgs = async (phone: string) => { const r = await supabase.from('whatsapp_messages').select('id,direction,source,body,status,error,provider_at,order_id').eq('phone', phone).order('provider_at').limit(500); if (!r.error) setMsgs(r.data); };
  const loadCfg = async () => { const r = await supabase.from('whatsapp_settings').select('auto_reply_enabled,auto_reply_text,quick_replies,account_state,account_event,business').eq('id', 1).single(); if (!r.error) setCfg({ ...r.data,business:businessSchema.parse(r.data.business), quick_replies: Array.isArray(r.data.quick_replies) ? r.data.quick_replies as string[] : [] }); };

  useEffect(() => { void checkStatus(); void loadConvs(); void loadCfg();void loadRequests(); const t = setInterval(() => {void loadConvs();void loadRequests();}, 5000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!active) return; void loadMsgs(active);void loadNotes(active);void actionFn({data:{phone:active,action:'read'}}).catch(()=>{}); const t = setInterval(() => void loadMsgs(active), 4000); return () => clearInterval(t); }, [active]);

  const conv = convs.find(c => c.phone === active);
  const linked: Order[] = useMemo(() => active ? orders.filter(o => o.customerPhone && normalizePhone(o.customerPhone) === active).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8) : [], [orders, active]);
  const windowOpen = conv?.last_inbound_at ? Date.now() - new Date(conv.last_inbound_at).getTime() < 24 * 3600_000 : false;

  async function send(body = text) {
    if (!active || !body.trim()) return;
    setBusy(true);
    try { await sendFn({ data: { phone: active, text: body, orderId: orderId || null } }); write(''); await loadMsgs(active); await loadConvs(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao enviar'); await loadMsgs(active); }
    finally { setBusy(false); }
  }
  async function syncHistory() {
    setBusy(true);
    try { const r = await syncFn(); toast.message('Pedido de importação enviado', { description: r.results.join(' · ') }); } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha'); } finally { setBusy(false); }
  }
  const orderMsg = (o: Order) => `Olá${o.customer ? `, ${o.customer}` : ''}! Pedido #${o.number}: ${STATUS_LABEL[o.status] ?? o.status}.`;

  return <section className="mx-auto flex h-full max-w-7xl flex-col gap-3">
    <div className="flex flex-wrap items-center gap-3 border-b pb-3">
      <MessageCircle className="text-success"/><h1 className="text-2xl font-bold">WhatsApp</h1>
      {status === null ? <span className="text-sm text-muted-foreground">Verificando…</span> : status.connected
        ? <span className="text-sm text-success">● Conectado · {status.phone}{status.coexistence ? ' · também no celular' : ''}</span>
        : <span className="text-sm text-destructive">● Desconectado</span>}
      {cfg?.account_state === 'blocked' && <span className="flex items-center gap-1 text-sm text-destructive"><AlertTriangle size={14}/> Conta bloqueada pela Meta ({cfg.account_event}) — reconecte</span>}
      <div className="ml-auto flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void checkStatus()}><RefreshCw/> Verificar</Button>
        {status?.connected && <Button variant="outline" size="sm" disabled={busy} onClick={() => void syncHistory()}><History/> Importar conversas</Button>}
        <Button variant="outline" size="sm" onClick={() => setShowCfg(v => !v)}><Settings2/> Configurações</Button>
      </div>
    </div>
    {status && !status.connected && <p className="border-l-2 border-warning bg-warning/10 p-3 text-sm">O WhatsApp da loja ainda não está conectado. A conexão é feita uma vez pela conta da Meta; depois fica salva. {status.reason}</p>}
    {showCfg&&cfg&&<WhatsAppBusinessSettings initial={cfg.business} enabled={cfg.auto_reply_enabled} quick={cfg.quick_replies} onSaved={()=>{void loadCfg();setShowCfg(false);}}/>}
    {requests.length>0&&<div className="space-y-2 border-l-2 border-warning p-3"><h2 className="font-semibold text-warning">Aguardando aceite da loja · {requests.length}</h2>{requests.map(r=><div key={r.id} className="flex flex-wrap items-center gap-2 text-sm"><Button variant="ghost" onClick={()=>setActive(r.phone)}>{convs.find(c=>c.phone===r.phone)?.name||`+${r.phone}`} · {brl(r.quoted_total)}</Button><span className="text-muted-foreground">{Math.floor((Date.now()-Date.parse(r.created_at))/60000)} min</span><Button size="sm" disabled={busy} onClick={()=>void accept(r.id,true)}>Aceitar e enviar à cozinha</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void accept(r.id,false)}>Recusar</Button><details className="w-full"><summary>Resumo</summary><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(r.request,null,2)}</pre></details></div>)}</div>}
    <div className="flex flex-wrap gap-1"><Button size="sm" variant={filter==='all'?'default':'outline'} onClick={()=>setFilter('all')}>Todos · {convs.length}</Button>{Object.entries(attendanceLabels).map(([key,label])=><Button key={key} size="sm" variant={filter===key?'default':'outline'} onClick={()=>setFilter(key)}>{label} · {convs.filter(c=>c.attendance_status===key).length}</Button>)}</div>
    <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[280px_minmax(0,1fr)_240px]">
      <ul className="min-h-0 overflow-y-auto rounded-lg border">
        <li className="p-2"><input aria-label="Buscar conversa" className="field" placeholder="Nome ou WhatsApp" value={search} onChange={e=>setSearch(e.target.value)}/></li>
        {convs.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nenhuma conversa ainda.</li>}
        {convs.filter(c=>(filter==='all'||c.attendance_status===filter)&&`${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())).map(c => <li key={c.phone}><Button variant="ghost" onClick={() => setActive(c.phone)} className={`h-auto w-full flex-col items-stretch border-b p-3 text-left ${active === c.phone ? 'bg-primary/10' : 'hover:bg-elevated'}`}>
          <div className="flex justify-between gap-2"><span className="truncate font-semibold">{c.name || `+${c.phone}`}</span>{c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-success px-1 text-[10px] text-background">{c.unread}</span>}</div>
          <div className="truncate text-xs text-muted-foreground">{c.last_message}</div>
          <div className="flex flex-wrap justify-between gap-1 text-[10px] text-muted-foreground"><span>{c.assigned_name||'Sem responsável'}</span>{c.awaiting_since&&<span className={Date.now()-Date.parse(c.awaiting_since)>(cfg?.business.reminderMinutes??5)*60000?'text-warning':''}>{Math.floor((Date.now()-Date.parse(c.awaiting_since))/60000)} min aguardando</span>}</div>
        </Button></li>)}
      </ul>
      <div className="flex min-h-[360px] flex-col rounded-lg border">
        {!active ? <div className="m-auto text-sm text-muted-foreground">Escolha uma conversa</div> : <>
          <div className="space-y-2 border-b p-3"><div className="font-semibold">{conv?.name || `+${active}`}</div><div className="text-xs text-muted-foreground">+{active} · {windowOpen ? 'Janela de atendimento aberta' : 'Fora da janela de 24 h: somente modelos aprovados'}</div><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={()=>void action('take')}><UserRound size={14}/>Assumir atendimento</Button><Button size="sm" variant="outline" onClick={()=>void action('resume')}>Retomar robô</Button><Button size="sm" variant="outline" onClick={()=>void action('waiting')}>Aguardar cliente</Button><Button size="sm" variant="outline" onClick={()=>void action('finish')}>Finalizar</Button></div><div className="text-xs text-muted-foreground">{conv?.assigned_name||'Sem responsável'} · Robô {conv?.automation_paused?'pausado':'disponível'}</div></div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {msgs.map(m => <div key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.direction === 'in' ? 'bg-elevated' : 'ml-auto bg-primary/15'}`}>
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                {m.source === 'auto' && 'automática · '}{m.source === 'phone' && 'pelo celular · '}{m.source === 'history' && 'importada · '}
                {new Date(m.provider_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {m.direction === 'out' && (m.status === 'read' ? <CheckCheck size={12} className="text-success"/> : m.status === 'delivered' ? <CheckCheck size={12}/> : m.status === 'failed' ? <AlertTriangle size={12} className="text-destructive"/> : <Check size={12}/>)}
              </div>
              {m.status === 'failed' && m.error && <div className="mt-1 text-[10px] text-destructive">{m.error.slice(0, 160)}</div>}
            </div>)}
          </div>
          {cfg && cfg.quick_replies.length > 0 && <div className="flex gap-1 overflow-x-auto border-t p-2">{cfg.quick_replies.map((q, i) => <Button key={i} variant="outline" size="sm" className="shrink-0" onClick={() => write(q)}>{q.slice(0, 30)}</Button>)}</div>}
          <div className="flex gap-2 border-t p-2">
            <textarea aria-label="Mensagem" className="field min-h-11 flex-1" rows={1} maxLength={4000} value={text} onChange={e => write(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Escreva uma mensagem"/>
            <Button disabled={busy || !text.trim() || !status?.connected} onClick={() => void send()}><Send/> Enviar</Button>
            <Button size="icon" variant="outline" title="Enviar cardápio PDF" aria-label="Enviar cardápio PDF" disabled={!cfg?.business.pdfPath||busy} onClick={()=>{if(active)void pdfFn({data:{phone:active}}).then(()=>toast.message('PDF na fila de envio')).catch(e=>toast.error(e.message));}}><FileText/></Button>
          </div>
        </>}
      </div>
      <aside className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="font-semibold">Notas internas</div>{notes.map(n=><div key={n.id} className="border-l-2 border-warning pl-2 text-xs">{n.body}<span className="block text-muted-foreground">{n.author_name}</span></div>)}<textarea aria-label="Nota interna" className="field" value={note} onChange={e=>setNote(e.target.value)} placeholder="Somente para a equipe"/><Button size="sm" variant="outline" disabled={!note.trim()||!active} onClick={()=>void action('note')}>Salvar nota interna</Button>
        <div className="font-semibold">Pedidos deste cliente</div>
        {!active ? <p className="text-muted-foreground">—</p> : linked.length === 0 ? <p className="text-muted-foreground">Nenhum pedido com este WhatsApp.</p> : linked.map(o => <div key={o.id} className={`rounded border p-2 ${orderId === o.id ? 'border-primary' : ''}`}>
          <div className="flex justify-between"><span>#{o.number} · {o.type}</span><span>{STATUS_LABEL[o.status] ?? o.status}</span></div>
          <div className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {brl(o.items.reduce((a, i) => a + i.price * i.qty, 0))}</div>
          <div className="mt-1 flex gap-1"><Button size="sm" variant="ghost" onClick={() => setOrderId(orderId === o.id ? '' : o.id)}>{orderId === o.id ? 'Vinculado' : 'Vincular'}</Button><Button size="sm" variant="ghost" onClick={() => { setOrderId(o.id); write(orderMsg(o)); }}>Avisar status</Button></div>
        </div>)}
      </aside>
    </div>
  </section>;
}
