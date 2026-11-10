import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, RefreshCw, CheckCheck, Check, AlertTriangle, Settings2, History, UserRound, FileText, ArrowLeft, Search } from 'lucide-react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { brl, useStore, type Order } from '@/lib/pdv-store';
import { normalizePhone } from '@/lib/pdv-customers';
import { whatsappSend, whatsappStatus, whatsappSyncHistory } from '@/lib/whatsapp.functions';
import {businessSchema,attendanceLabels,type Business} from '@/lib/whatsapp-business';
import {whatsappAction,whatsappRequestAction,whatsappSendPdf,whatsappStaff} from '@/lib/whatsapp-attendance.functions';
import {WhatsAppBusinessSettings} from './WhatsAppBusinessSettings';
import {WhatsAppCustomerCard} from './WhatsAppCustomerCard';
import {refreshWhatsAppConversations} from '@/lib/whatsapp-alerts';
import {ReceiptReview} from './ReceiptReview';
import {ReceiptRegistration} from './ReceiptRegistration';
import {retryReceiptAnalysis} from '@/lib/receipt-actions.functions';
import { isStoreToday, storeDayStart } from '@/lib/daily-inbox';

type Conv = { phone: string; name: string | null; last_message: string | null; last_message_at: string; unread: number; last_inbound_at: string | null; attendance_status:string; assigned_name:string|null; automation_paused:boolean; awaiting_since:string|null };
type Msg = { id: string; direction: string; source: string; kind: string; body: string | null; sent_by_name?: string | null; status: string; error: string | null; provider_at: string; order_id: string | null };
type Cfg = { auto_reply_enabled: boolean; auto_reply_text: string; quick_replies: string[]; account_state: string; account_event: string | null; business:Business };
type Status = Awaited<ReturnType<typeof whatsappStatus>>;

const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', cozinha: 'Em preparo', pronto: 'Pronto', pago: 'Pago', cancelado: 'Cancelado', entregue: 'Entregue' };
type Tab='new'|'in_service'|'ordered'|'paid'|'archived';
const TABS:[Tab,string][]=[['new','Novos'],['in_service','Em atendimento'],['ordered','Já pediram'],['paid','Pagos'],['archived','Arquivadas']];
const queueOf=(c:Conv)=>c.attendance_status==='new'||(c.attendance_status==='needs_reply'&&!c.assigned_name)?'new':c.attendance_status==='needs_reply'?'in_service':c.attendance_status;

export function WhatsAppView({openPhone,isAdmin=true,externalOrders,onBuildOrder,paidIds}:{openPhone?:string|null;isAdmin?:boolean;externalOrders?:Order[];onBuildOrder?:(phone:string,name:string)=>void;paidIds?:string[]}) {
  const[recent,setRecent]=useState<{phone:string;status:string;order_id:string|null}[]>([]);const[paidPhones,setPaidPhones]=useState<string[]>([]);
  const staffFn=useServerFn(whatsappStaff);const[staff,setStaff]=useState<{id:string;name:string}[]>([]);const[transferTo,setTransferTo]=useState('');
  const statusFn = useServerFn(whatsappStatus);
  const sendFn = useServerFn(whatsappSend);
  const syncFn = useServerFn(whatsappSyncHistory);
  const actionFn=useServerFn(whatsappAction);const requestFn=useServerFn(whatsappRequestAction);const pdfFn=useServerFn(whatsappSendPdf);const retryFn=useServerFn(retryReceiptAnalysis);
  const storeOrders = useStore(s => s.orders);const orders=externalOrders??storeOrders;
  const [status, setStatus] = useState<Status | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [orderId, setOrderId] = useState<string>('');
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [showCfg, setShowCfg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter,setFilter]=useState<Tab>('new');const[search,setSearch]=useState('');const[note,setNote]=useState('');
  const[jobErrors,setJobErrors]=useState<{id:string;phone:string;processing_error:string|null;state:string}[]>([]);
  const[notes,setNotes]=useState<{id:string;body:string;author_name:string|null}[]>([]);
  const[requests,setRequests]=useState<{id:string;phone:string;quoted_total:number;request:unknown;created_at:string;public_code:string|null}[]>([]);
  const[drafts,setDrafts]=useState<Record<string,string>>({});
  const [period,setPeriod]=useState<'today'|'history'>('today');
  const [day,setDay]=useState(()=>storeDayStart());
  useEffect(()=>{try{setDrafts(JSON.parse(localStorage.getItem('ultrabrasa-wa-drafts')??'{}'));}catch{}},[]);
  useEffect(()=>{if(openPhone)setActive(openPhone);},[openPhone]);
  useEffect(()=>{if(active)setText(drafts[active]??'');},[active]);
  const write=(value:string)=>{setText(value);if(active){setDrafts(prev=>{const next={...prev,[active]:value};localStorage.setItem('ultrabrasa-wa-drafts',JSON.stringify(next));return next;});}};
  async function action(kind:'take'|'resume'|'read'|'waiting'|'finish'|'note'|'transfer'){if(!active)return;try{await actionFn({data:{phone:active,action:kind,body:kind==='note'?note:kind==='transfer'?transferTo:undefined}});if(kind==='note')setNote('');if(kind==='transfer'){setTransferTo('');toast.success('Atendimento transferido');}await loadConvs();await loadNotes(active);void refreshWhatsAppConversations();}catch(e){toast.error(e instanceof Error?e.message:'Falha');}}
  async function loadNotes(phone:string){const r=await supabase.from('whatsapp_notes').select('id,body,author_name').eq('phone',phone).order('created_at');if(!r.error)setNotes(r.data);}
  async function loadRequests(){const r=await supabase.from('whatsapp_order_requests').select('id,phone,quoted_total,request,created_at,public_code').eq('status','awaiting_acceptance').order('created_at');if(!r.error)setRequests(r.data);const since=storeDayStart();const rq=await supabase.from('whatsapp_order_requests').select('phone,status,order_id').gte('created_at',since);if(!rq.error)setRecent(rq.data);const rc=await supabase.from('payment_receipts').select('phone').eq('state','confirmed').gte('received_at',since);if(!rc.error)setPaidPhones(rc.data.map(x=>x.phone));const jobs=await supabase.from('whatsapp_jobs').select('id,phone,processing_error,state').in('state',['failed','unknown']).order('created_at',{ascending:false}).limit(10);if(!jobs.error)setJobErrors(jobs.data);}
  async function accept(id:string,yes:boolean){const reason=yes?undefined:window.prompt('Motivo da recusa');if(!yes&&!reason?.trim())return;setBusy(true);try{await requestFn({data:{id,accept:yes,reason:reason??undefined}});toast.success(yes?'Pedido aceito e enviado à cozinha':'Pedido recusado');await loadRequests();await loadConvs();void refreshWhatsAppConversations();}catch(e){toast.error(e instanceof Error?e.message:'Falha');}finally{setBusy(false);}}

  const checkStatus = () => statusFn().then(setStatus).catch(e => setStatus({ connected: false, reason: String(e?.message ?? e) }));
  const loadConvs = async () => { let q = supabase.from('whatsapp_conversations').select('phone,name,last_message,last_message_at,unread,last_inbound_at,attendance_status,assigned_name,automation_paused,awaiting_since');if(period==='today')q=q.gte('last_message_at',day);const r=await q.order('last_message_at', { ascending: false }).limit(500); if (!r.error) setConvs(r.data); };
  const loadMsgs = async (phone: string) => { let q = supabase.from('whatsapp_messages').select('id,direction,source,kind,body,status,error,provider_at,order_id,sent_by_name').eq('phone', phone);if(period==='today')q=q.gte('provider_at',day);const r=await q.order('provider_at',{ascending:false}).limit(500); if (!r.error) setMsgs([...r.data].reverse()); };
  const loadCfg = async () => { const r = await supabase.from('whatsapp_settings').select('auto_reply_enabled,auto_reply_text,quick_replies,account_state,account_event,business').eq('id', 1).single(); if (!r.error) setCfg({ ...r.data,business:businessSchema.parse(r.data.business), quick_replies: Array.isArray(r.data.quick_replies) ? r.data.quick_replies as string[] : [] }); };

  useEffect(() => { void checkStatus(); void loadConvs(); void loadCfg();void loadRequests();void staffFn().then(setStaff).catch(()=>{}); const t = setInterval(() => {void loadRequests();}, 5000); return () => clearInterval(t); }, []);
  useEffect(()=>{void loadConvs();const t=setInterval(()=>{setDay(storeDayStart());void loadConvs();},5000);return()=>clearInterval(t);},[period,day]);
  useEffect(() => { if (!active) return;setMsgs([]); void loadMsgs(active);void loadNotes(active);void actionFn({data:{phone:active,action:'read'}}).catch(()=>{}); const t = setInterval(() => void loadMsgs(active), 4000); return () => clearInterval(t); }, [active,period,day]);

  const paidSet=useMemo(()=>new Set([...(paidIds??[]),...orders.filter(o=>o.paymentStatus==='pago').map(o=>o.id)]),[paidIds,orders]);
  const situation=(c:Conv):Tab=>{const q=queueOf(c);if(q==='finished'||!isStoreToday(c.last_message_at))return'archived';const reqs=recent.filter(r=>r.phone===c.phone&&r.status==='accepted');if(recent.some(r=>r.phone===c.phone&&r.status==='awaiting_acceptance')||reqs.some(r=>r.order_id&&!paidSet.has(r.order_id)))return'ordered';if(paidPhones.includes(c.phone)||reqs.some(r=>r.order_id&&paidSet.has(r.order_id)))return'paid';if(reqs.length)return'ordered';if(q==='new')return'new';return'in_service';};
  const visibleConvs=convs.filter(c=>(period==='history'||isStoreToday(c.last_message_at))&&(search.trim()?true:situation(c)===filter)&&`${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase()));
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

  const [linkingMsg,setLinkingMsg]=useState<string|null>(null);
  const linkableOrders=(o:Order)=>o.status!=='cancelado'&&o.paymentStatus!=='pago'&&!o.payments.length;
  async function linkReceipt(messageId:string,order:Order){
    setBusy(true);
    try{
      const r=await supabase.rpc('register_staff_receipt',{_message:messageId,_order:order.id,_path:null} as never);
      if(r.error)throw r.error;
      toast.success(`Comprovante vinculado ao pedido #${order.number} — conferência pendente no caixa`);
      setLinkingMsg(null);
    }catch(e){
      const msg=e instanceof Error?e.message:'Falha ao vincular';
      if(msg.includes('ainda não baixado')){
        try{await retryFn({data:{messageId}});toast.message('Arquivo recuperado — tente vincular de novo');}catch(re){toast.error(re instanceof Error?re.message:'Não foi possível processar o arquivo');}
      }else toast.error(msg);
    }finally{setBusy(false);}
  }

  return <section className="mx-auto flex h-full max-w-7xl flex-col gap-4 bg-white p-2 text-slate-800 sm:p-4">
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white pb-4">
      <MessageCircle className="text-success"/><h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">WhatsApp</h1>
      {status === null ? <span className="text-sm text-slate-500">Verificando…</span> : status.connected
        ? <span className="text-sm text-success">● Conectado · {status.phone}{status.coexistence ? ' · também no celular' : ''}</span>
        : <span className="text-sm text-destructive">● Desconectado</span>}
      {cfg?.account_state === 'blocked' && <span className="flex items-center gap-1 text-sm text-destructive"><AlertTriangle size={14}/> Conta bloqueada pela Meta ({cfg.account_event}) — reconecte</span>}
      <div className="ml-auto flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void checkStatus()}><RefreshCw/> Verificar</Button>
        {isAdmin&&status?.connected && <Button variant="outline" size="sm" disabled={busy} onClick={() => void syncHistory()}><History/> Importar conversas</Button>}
        {isAdmin&&<Button variant="outline" size="sm" onClick={() => setShowCfg(v => !v)}><Settings2/> Configurações</Button>}
      </div>
    </div>
    {status && !status.connected && <p className="border-l-2 border-warning bg-warning/10 p-3 text-sm">O WhatsApp da loja ainda não está conectado. A conexão é feita uma vez pela conta da Meta; depois fica salva. {status.reason}</p>}
    {isAdmin&&showCfg&&cfg&&<WhatsAppBusinessSettings initial={cfg.business} enabled={cfg.auto_reply_enabled} quick={cfg.quick_replies} onSaved={()=>{void loadCfg();setShowCfg(false);}}/>}
    <details><summary className="cursor-pointer text-sm font-semibold">Comprovantes e conferência de pagamento</summary><ReceiptReview/></details>
    {jobErrors.length>0&&<details className="border-l-2 border-destructive p-2 text-sm"><summary>Envios ou automação precisam de revisão · {jobErrors.length}</summary>{jobErrors.map(j=><div key={j.id} className="py-1"><Button variant="ghost" size="sm" onClick={()=>setActive(j.phone)}>+{j.phone}</Button> · {j.state==='unknown'?'Resultado desconhecido; confira antes de reenviar':'Falha'} · {j.processing_error}</div>)}</details>}
    {requests.filter(r=>period==='history'||isStoreToday(r.created_at)).length>0&&<div className="space-y-2 border-l-2 border-warning p-3"><h2 className="font-semibold text-warning">Aguardando aceite da loja · {requests.filter(r=>period==='history'||isStoreToday(r.created_at)).length}</h2>{requests.filter(r=>period==='history'||isStoreToday(r.created_at)).map(r=><div key={r.id} className="flex flex-wrap items-center gap-2 text-sm"><Button variant="ghost" onClick={()=>setActive(r.phone)}>{r.public_code?`Catálogo ${r.public_code} · `:''}{convs.find(c=>c.phone===r.phone)?.name||`+${r.phone}`} · {brl(r.quoted_total)}</Button><span className="text-slate-500">{Math.floor((Date.now()-Date.parse(r.created_at))/60000)} min</span><Button size="sm" className="border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy} onClick={()=>void accept(r.id,true)}>Aceitar e enviar à cozinha</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void accept(r.id,false)}>Recusar</Button><details className="w-full"><summary>Resumo</summary><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(r.request,null,2)}</pre></details></div>)}</div>}
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mr-2 min-w-0"><p className="text-sm font-semibold text-slate-800">Período</p><p className="text-xs text-slate-500">Escolha quais conversas deseja visualizar</p></div>
      <Button size="sm" variant="ghost" className={period==='today'?'border border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800':'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900'} onClick={()=>{setPeriod('today');setActive(null);setFilter('new');setConvs([]);}}>Hoje</Button>
      <Button size="sm" variant="ghost" className={period==='history'?'border border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800':'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900'} onClick={()=>{setPeriod('history');setActive(null);setFilter('archived');setConvs([]);}}><History size={14}/> Histórico</Button>
      <span className="ml-auto text-xs text-slate-500">{period==='today'?'Atendimentos de hoje':'Histórico preservado'}</span>
    </div>
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div><h2 className="text-sm font-semibold text-slate-900">Etapas do atendimento</h2><p className="text-xs text-slate-500">As conversas ficam separadas conforme o andamento de cada cliente.</p></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">{TABS.map(([key,label])=>{const n=convs.filter(c=>(period==='history'||isStoreToday(c.last_message_at))&&situation(c)===key).length;const selected=filter===key;return <Button key={key} variant="ghost" className={`h-auto min-h-14 justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${selected?'border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900':'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'}`} onClick={()=>setFilter(key)}><span className="min-w-0 whitespace-normal text-xs font-semibold sm:text-sm">{label}</span><span className={`grid h-7 min-w-7 shrink-0 place-items-center rounded-full px-2 text-xs font-bold ${selected?'bg-emerald-600 text-white':'bg-slate-200 text-slate-700'}`}>{n}</span></Button>;})}</div>
    </section>
    <div className="grid min-h-0 flex-1 gap-3 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_260px]">
      <ul className={`min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm ${active ? 'hidden md:block' : 'block'}`}>
        <li className="sticky top-0 z-10 border-b border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between"><span className="font-semibold">Conversas</span><span className="text-xs text-slate-500">{visibleConvs.length} atendimento(s)</span></div>
          <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input aria-label="Buscar conversa" className="field pl-9" placeholder="Buscar nome ou WhatsApp" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        </li>
        {!visibleConvs.length && <li className="p-4 text-sm text-slate-500">Nenhuma conversa {period==='today'?'de hoje ':''}neste filtro.</li>}
        {[...visibleConvs].sort((a,b)=>Date.parse(b.last_message_at)-Date.parse(a.last_message_at)).map(c => <li key={c.phone}><Button variant="ghost" onClick={() => setActive(c.phone)} className={`h-auto w-full flex-col items-stretch border-b border-slate-100 p-3 text-left text-slate-700 hover:text-slate-900 ${active === c.phone ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">{(c.name || c.phone).trim().slice(0,1).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="flex justify-between gap-2"><span className="truncate font-semibold">{c.name || `+${c.phone}`}</span><span className="shrink-0 text-[10px] text-slate-500">{new Date(c.last_message_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span></span>
              <span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-slate-500">{c.last_message || 'Nenhuma mensagem'}</span>{c.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-success px-1 text-[10px] text-background">{c.unread}</span>}</span>
            </span>
          </div>
          <div className="flex flex-wrap justify-between gap-1 text-[10px] text-slate-500"><span className={c.assigned_name?'font-semibold text-foreground':''}>{c.assigned_name?`Responsável: ${c.assigned_name}`:'Sem responsável'}</span>{c.attendance_status==='needs_reply'&&c.assigned_name&&<span className="rounded bg-warning/20 px-1 font-semibold text-warning">Precisa de resposta</span>}{c.awaiting_since&&<span className={Date.now()-Date.parse(c.awaiting_since)>(cfg?.business.reminderMinutes??5)*60000?'text-warning':''}>{Math.floor((Date.now()-Date.parse(c.awaiting_since))/60000)} min aguardando</span>}</div>
        </Button></li>)}
      </ul>
      <div className={`min-h-[min(70vh,680px)] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${active ? 'flex' : 'hidden md:flex'}`}>
        {!active ? <div className="m-auto hidden text-sm text-slate-500 md:block">Escolha uma conversa</div> : <>
          <div className="sticky top-0 z-10 space-y-3 border-b border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="md:hidden" aria-label="Voltar para conversas" onClick={()=>setActive(null)}><ArrowLeft/></Button>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">{(conv?.name || active).trim().slice(0,1).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{conv?.name || `+${active}`}</div><div className="truncate text-xs text-slate-500">+{active}</div></div>
              <span className={`hidden rounded-full px-2 py-1 text-[10px] sm:inline-flex ${windowOpen?'bg-success/10 text-success':'bg-warning/10 text-warning'}`}>{windowOpen ? 'Atendimento aberto' : 'Fora da janela de 24 h'}</span>
            </div><div className="text-xs text-slate-500">+{active} · {windowOpen ? 'Janela de atendimento aberta' : 'Fora da janela de 24 h: somente modelos aprovados'}</div><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={()=>void action('take')}><UserRound size={14}/>Assumir atendimento</Button><Button size="sm" variant="outline" onClick={()=>void action('resume')}>Retomar robô</Button><Button size="sm" variant="outline" onClick={()=>void action('waiting')}>Aguardar cliente</Button><Button size="sm" variant="outline" onClick={()=>{void action('finish');setActive(null);}}>Arquivar</Button>{onBuildOrder&&<Button size="sm" className="border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700" onClick={()=>onBuildOrder(active,conv?.name??'')}>Montar pedido</Button>}<select aria-label="Transferir para" className="field h-8 text-xs" value={transferTo} onChange={e=>setTransferTo(e.target.value)}><option value="">Transferir para…</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><Button size="sm" variant="outline" disabled={!transferTo} onClick={()=>void action('transfer')}>Transferir</Button></div><div className="text-xs text-slate-500">{conv?.assigned_name||'Sem responsável'} · Robô {conv?.automation_paused?'pausado':'disponível'}</div></div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3 sm:p-5">
            {msgs.map(m => <div key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.direction === 'in' ? 'border border-slate-200 bg-white text-slate-800 shadow-sm' : 'ml-auto border border-emerald-100 bg-emerald-50 text-slate-800 shadow-sm'}`}>
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                {m.source === 'auto' && 'automática · '}{m.sent_by_name && `${m.sent_by_name} · `}{m.source === 'phone' && 'pelo celular · '}{m.source === 'history' && 'importada · '}
                {new Date(m.provider_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {m.direction === 'out' && (m.status === 'read' ? <CheckCheck size={12} className="text-success"/> : m.status === 'delivered' ? <CheckCheck size={12}/> : m.status === 'failed' ? <AlertTriangle size={12} className="text-destructive"/> : <Check size={12}/>)}
              </div>
              {m.status === 'failed' && m.error && <div className="mt-1 text-[10px] text-destructive">{m.error.slice(0, 160)}</div>}
              {m.direction==='in'&&['image','document'].includes(m.kind)&&<div className="mt-2 space-y-1">
                {linkingMsg===m.id
                  ? <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3"><p className="text-[11px] font-semibold">Vincular a qual pedido?</p>{linked.filter(linkableOrders).map(o=><Button key={o.id} size="sm" variant="outline" className="mr-1" disabled={busy} onClick={()=>void linkReceipt(m.id,o)}>#{o.number} · {brl(o.items.reduce((a,i)=>a+i.price*i.qty,0))}</Button>)}{!linked.filter(linkableOrders).length&&<p className="text-[11px] text-slate-500">Nenhum pedido ativo deste cliente aguardando pagamento.</p>}<Button size="sm" variant="ghost" onClick={()=>setLinkingMsg(null)}>Cancelar</Button></div>
                  : <Button size="sm" variant="outline" disabled={busy} onClick={()=>{const options=linked.filter(linkableOrders);if(options.length===1&&options[0])void linkReceipt(m.id,options[0]);else setLinkingMsg(m.id);}}>Vincular ao pedido / Comprovante recebido</Button>}
              </div>}
            </div>)}
          </div>
          {cfg && cfg.quick_replies.length > 0 && <div className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-white p-3">{cfg.quick_replies.map((q, i) => <Button key={i} variant="outline" size="sm" className="shrink-0" onClick={() => write(q)}>{q.slice(0, 30)}</Button>)}</div>}
          <div className="flex gap-2 border-t border-slate-200 bg-white p-3">
            <textarea aria-label="Mensagem" className="field min-h-11 flex-1" rows={1} maxLength={4000} value={text} onChange={e => write(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Escreva uma mensagem"/>
            <Button className="border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy || !text.trim() || !status?.connected} onClick={() => void send()}><Send/> Enviar</Button>
            <Button size="icon" variant="outline" title="Enviar cardápio PDF" aria-label="Enviar cardápio PDF" disabled={!cfg?.business.pdfPath||busy} onClick={()=>{if(active)void pdfFn({data:{phone:active}}).then(()=>toast.message('PDF na fila de envio')).catch(e=>toast.error(e.message));}}><FileText/></Button>
          </div>
        </>}
      </div>
      <aside className="hidden space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm xl:block">
        {active&&<WhatsAppCustomerCard phone={active}/>}
        <div className="font-semibold">Notas internas</div>{notes.map(n=><div key={n.id} className="border-l-2 border-warning pl-2 text-xs">{n.body}<span className="block text-slate-500">{n.author_name}</span></div>)}<textarea aria-label="Nota interna" className="field" value={note} onChange={e=>setNote(e.target.value)} placeholder="Somente para a equipe"/><Button size="sm" variant="outline" disabled={!note.trim()||!active} onClick={()=>void action('note')}>Salvar nota interna</Button>
        <div className="font-semibold">Pedidos deste cliente</div>
        {active&&<ReceiptRegistration phone={active} onSaved={()=>void loadMsgs(active)}/>}
        {!active ? <p className="text-slate-500">—</p> : linked.length === 0 ? <p className="text-slate-500">Nenhum pedido com este WhatsApp.</p> : linked.map(o => <div key={o.id} className={`rounded-lg border border-slate-200 bg-white p-3 ${orderId === o.id ? 'border-primary' : ''}`}>
          <div className="flex justify-between"><span>#{o.number} · {o.type}</span><span>{STATUS_LABEL[o.status] ?? o.status}</span></div>
          <div className="text-xs text-slate-500">{new Date(o.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {brl(o.items.reduce((a, i) => a + i.price * i.qty, 0))}</div>
          <div className="mt-1 flex flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={() => setOrderId(orderId === o.id ? '' : o.id)}>{orderId === o.id ? 'Vinculado' : 'Vincular'}</Button><Button size="sm" variant="ghost" onClick={() => { setOrderId(o.id); write(orderMsg(o)); }}>Avisar status</Button>{o.status!=='cancelado'&&<ReceiptRegistration phone={active??undefined} orderId={o.id}/>}</div>
        </div>)}
      </aside>
    </div>
  </section>;
}
