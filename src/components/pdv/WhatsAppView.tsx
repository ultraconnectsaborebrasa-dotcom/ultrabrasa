import { EditWhatsAppRequest } from './EditWhatsAppRequest';
import { confirmAction, promptAction } from '@/lib/confirm-action';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AlertTriangle, Archive, ArrowRight, Bot, Check, CheckCheck, Clock3, FileText,
  History, Inbox, MessageCircle, PanelRight, ReceiptText, RefreshCw, Search,
  Send, Settings2, ShoppingBag, UserRound, X,
} from 'lucide-react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { brl, useStore, type Order } from '@/lib/pdv-store';
import { normalizePhone } from '@/lib/pdv-customers';
import { whatsappSend, whatsappStatus, whatsappSyncHistory } from '@/lib/whatsapp.functions';
import { businessSchema, type Business } from '@/lib/whatsapp-business';
import { whatsappAction, whatsappRequestAction, whatsappSendPdf, whatsappStaff } from '@/lib/whatsapp-attendance.functions';
import { WhatsAppBusinessSettings } from './WhatsAppBusinessSettings';
import { WhatsAppRobotToggle } from './WhatsAppRobotToggle';
import { WhatsAppCustomerCard } from './WhatsAppCustomerCard';
import { refreshWhatsAppConversations } from '@/lib/whatsapp-alerts';
import { ReceiptReview } from './ReceiptReview';
import { ReceiptRegistration } from './ReceiptRegistration';
import { recoverReceiptAttachment } from '@/lib/receipt-actions.functions';
import { isStoreToday, storeDayStart } from '@/lib/daily-inbox';
import { needsStaffReply, sortQueue, type QueueOrder } from '@/lib/whatsapp-queue';
import { autoPrintKitchenOrderById } from '@/lib/kitchen-print';

type Conv = { phone: string; name: string | null; last_message: string | null; last_message_at: string; unread: number; last_inbound_at: string | null; attendance_status: string; assigned_name: string | null; automation_paused: boolean; awaiting_since: string | null };
type Msg = { id: string; direction: string; source: string; kind: string; body: string | null; sent_by_name?: string | null; status: string; error: string | null; provider_at: string; order_id: string | null };
type Cfg = { auto_reply_enabled: boolean; auto_reply_text: string; quick_replies: string[]; account_state: string; account_event: string | null; business: Business };
type Status = Awaited<ReturnType<typeof whatsappStatus>>;
type RequestItem = { id: string; phone: string; quoted_total: number; request: unknown; created_at: string; public_code: string | null };
type Tab = 'new' | 'in_service' | 'ordered' | 'paid' | 'archived';
type ActionKind = 'take' | 'resume' | 'read' | 'waiting' | 'finish' | 'note' | 'transfer';

const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', cozinha: 'Em preparo', pronto: 'Pronto', pago: 'Pago', cancelado: 'Cancelado', entregue: 'Entregue', entrega: 'Em entrega', retirado: 'Retirado' };
const TABS: { key: Tab; label: string; hint: string; icon: typeof Inbox; tone: string; badge: string }[] = [
  { key: 'new', label: 'Novos', hint: 'Clientes esperando o primeiro atendimento', icon: Inbox, tone: 'border-t-primary', badge: 'bg-primary text-primary-foreground' },
  { key: 'in_service', label: 'Em atendimento', hint: 'Conversas em andamento com a equipe', icon: MessageCircle, tone: 'border-t-warning', badge: 'bg-warning text-background' },
  { key: 'ordered', label: 'Já pediram', hint: 'Pedidos registrados aguardando pagamento', icon: ShoppingBag, tone: 'border-t-foreground/50', badge: 'bg-secondary text-secondary-foreground' },
  { key: 'paid', label: 'Pagos', hint: 'Pagamentos confirmados no caixa', icon: CheckCheck, tone: 'border-t-success', badge: 'bg-success text-background' },
  { key: 'archived', label: 'Arquivadas', hint: 'Atendimentos encerrados e histórico', icon: Archive, tone: 'border-t-muted-foreground', badge: 'bg-muted text-muted-foreground' },
];
const queueOf = (c: Conv) => c.attendance_status === 'new' || (c.attendance_status === 'needs_reply' && !c.assigned_name) ? 'new' : c.attendance_status === 'needs_reply' ? 'in_service' : c.attendance_status;
const messageTime = (value: string) => new Date(value).toLocaleString('pt-BR', isStoreToday(value) ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const waitingTime = (value: string | null) => {
  if (!value) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
};

export function WhatsAppView({ openPhone, isAdmin = true, externalOrders, onBuildOrder, paidIds }: { openPhone?: string | null; isAdmin?: boolean; externalOrders?: Order[]; onBuildOrder?: (phone: string, name: string) => void; paidIds?: string[] }) {
  const [recent, setRecent] = useState<{ phone: string; status: string; order_id: string | null }[]>([]);
  const [paidPhones, setPaidPhones] = useState<string[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [transferTo, setTransferTo] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [orderId, setOrderId] = useState('');
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [showCfg, setShowCfg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cardBusy, setCardBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [queueOrder, setQueueOrder] = useState<QueueOrder>('arrival');
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [note, setNote] = useState('');
  const [jobErrors, setJobErrors] = useState<{ id: string; phone: string; processing_error: string | null; state: string }[]>([]);
  const [notes, setNotes] = useState<{ id: string; body: string; author_name: string | null }[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState<'today' | 'history'>('today');
  const [day, setDay] = useState(() => storeDayStart());
  const [clearedAt, setClearedAt] = useState(0);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [dragPhone, setDragPhone] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Tab | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [linkingMsg, setLinkingMsg] = useState<string | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const statusFn = useServerFn(whatsappStatus);
  const sendFn = useServerFn(whatsappSend);
  const syncFn = useServerFn(whatsappSyncHistory);
  const actionFn = useServerFn(whatsappAction);
  const requestFn = useServerFn(whatsappRequestAction);
  const pdfFn = useServerFn(whatsappSendPdf);
  const retryFn = useServerFn(recoverReceiptAttachment);
  const staffFn = useServerFn(whatsappStaff);
  const storeOrders = useStore(s => s.orders);
  const orders = externalOrders ?? storeOrders;
  const since = () => new Date(Math.max(Date.parse(day), clearedAt)).toISOString();

  useEffect(() => { setClearedAt(Number(localStorage.getItem('ultrabrasa-wa-cleared-at')) || 0); }, []);
  useEffect(() => { try { setDrafts(JSON.parse(localStorage.getItem('ultrabrasa-wa-drafts') ?? '{}')); } catch { /* rascunho local inválido */ } }, []);
  useEffect(() => { if (openPhone) openConversation(openPhone); }, [openPhone]);
  useEffect(() => { if (active) setText(drafts[active] ?? ''); }, [active]);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ block: 'end' }); }, [active, msgs.length]);
  useEffect(() => {
    if (!active) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [active]);

  function openConversation(phone: string) {
    setActive(phone);
    setShowDetails(false);
    setLinkingMsg(null);
  }
  function write(value: string) {
    setText(value);
    if (active) setDrafts(prev => {
      const next = { ...prev, [active]: value };
      localStorage.setItem('ultrabrasa-wa-drafts', JSON.stringify(next));
      return next;
    });
  }
  async function loadNotes(phone: string) {
    const r = await supabase.from('whatsapp_notes').select('id,body,author_name').eq('phone', phone).order('created_at');
    if (!r.error) setNotes(r.data);
  }
  async function loadRequests() {
    const r = await supabase.from('whatsapp_order_requests').select('id,phone,quoted_total,request,created_at,public_code').eq('status', 'awaiting_acceptance').order('created_at');
    if (!r.error) setRequests(r.data);
    const start = storeDayStart();
    const rq = await supabase.from('whatsapp_order_requests').select('phone,status,order_id').gte('created_at', start);
    if (!rq.error) setRecent(rq.data);
    const rc = await supabase.from('payment_receipts').select('phone').eq('state', 'confirmed').gte('received_at', start);
    if (!rc.error) setPaidPhones(rc.data.map(x => x.phone));
    const jobs = await supabase.from('whatsapp_jobs').select('id,phone,processing_error,state').in('state', ['failed', 'unknown']).order('created_at', { ascending: false }).limit(10);
    if (!jobs.error) setJobErrors(jobs.data);
  }
  const checkStatus = () => statusFn().then(setStatus).catch((e: unknown) => setStatus({ connected: false, reason: String(e instanceof Error ? e.message : e) }));
  const loadConvs = async () => {
    let q = supabase.from('whatsapp_conversations').select('phone,name,last_message,last_message_at,unread,last_inbound_at,attendance_status,assigned_name,automation_paused,awaiting_since');
    if (period === 'today') q = q.gte('last_message_at', since());
    const r = await q.order('last_message_at', { ascending: false }).limit(500);
    if (!r.error) setConvs(r.data);
    setLoadingConvs(false);
  };
  const loadMsgs = async (phone: string) => {
    let q = supabase.from('whatsapp_messages').select('id,direction,source,kind,body,status,error,provider_at,order_id,sent_by_name').eq('phone', phone);
    if (period === 'today') q = q.gte('provider_at', since());
    const r = await q.order('provider_at', { ascending: false }).limit(500);
    if (!r.error) setMsgs([...r.data].reverse());
  };
  const loadCfg = async () => {
    const r = await supabase.from('whatsapp_settings').select('auto_reply_enabled,auto_reply_text,quick_replies,account_state,account_event,business').eq('id', 1).single();
    if (!r.error) setCfg({ ...r.data, business: businessSchema.parse(r.data.business), quick_replies: Array.isArray(r.data.quick_replies) ? r.data.quick_replies as string[] : [] });
  };

  useEffect(() => { void checkStatus(); void loadConvs(); void loadCfg(); void loadRequests(); void staffFn().then(setStaff).catch(() => {}); const t = setInterval(() => { void loadRequests(); void loadCfg(); }, 5000); return () => clearInterval(t); }, []);
  useEffect(() => { setLoadingConvs(true); void loadConvs(); const t = setInterval(() => { setDay(storeDayStart()); void loadConvs(); }, 5000); return () => clearInterval(t); }, [period, day, clearedAt]);
  useEffect(() => {
    if (!active) return;
    setMsgs([]);
    void loadMsgs(active);
    void loadNotes(active);
    void actionFn({ data: { phone: active, action: 'read' } }).then(() => void loadConvs()).catch(() => {});
    const t = setInterval(() => void loadMsgs(active), 4000);
    return () => clearInterval(t);
  }, [active, period, day, clearedAt]);

  async function runAction(phone: string, kind: ActionKind, body?: string, success?: string) {
    setCardBusy(phone);
    try {
      await actionFn({ data: { phone, action: kind, body } });
      if (success) toast.success(success);
      await loadConvs();
      void refreshWhatsAppConversations();
      if (kind === 'finish' && active === phone) setActive(null);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar o atendimento');
      return false;
    } finally { setCardBusy(null); }
  }
  async function action(kind: ActionKind) {
    if (!active) return;
    const body = kind === 'note' ? note : kind === 'transfer' ? transferTo : undefined;
    const ok = await runAction(active, kind, body, kind === 'transfer' ? 'Atendimento transferido' : undefined);
    if (ok && kind === 'note') { setNote(''); await loadNotes(active); }
    if (ok && kind === 'transfer') setTransferTo('');
  }
  async function accept(id: string, yes: boolean) {
    const reason = yes ? undefined : await promptAction('Motivo da recusa', 'Recusar pedido');
    if (!yes && !reason?.trim()) return;
    setBusy(true);
    try {
      const accepted = await requestFn({ data: { id, accept: yes, reason: reason ?? undefined } });
      toast.success(yes ? 'Pedido aceito e enviado à cozinha' : 'Pedido recusado');
      const orderId = (accepted as { id?: unknown } | null)?.id;
      if (yes && typeof orderId === 'string') void autoPrintKitchenOrderById(orderId);
      await loadRequests();
      await loadConvs();
      void refreshWhatsAppConversations();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha'); }
    finally { setBusy(false); }
  }
  async function send(body = text) {
    if (!active || !body.trim()) return;
    setBusy(true);
    try { await sendFn({ data: { phone: active, text: body, orderId: orderId || null } }); write(''); await loadMsgs(active); await loadConvs(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao enviar'); await loadMsgs(active); }
    finally { setBusy(false); }
  }
  async function syncHistory() {
    setBusy(true);
    try { const r = await syncFn(); toast.message('Pedido de importação enviado', { description: r.results.join(' · ') }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha'); }
    finally { setBusy(false); }
  }

  const paidSet = useMemo(() => new Set([...(paidIds ?? []), ...orders.filter(o => o.paymentStatus === 'pago').map(o => o.id)]), [paidIds, orders]);
  const situation = (c: Conv): Tab => {
    const q = queueOf(c);
    if (q === 'finished' || !isStoreToday(c.last_message_at)) return 'archived';
    const reqs = recent.filter(r => r.phone === c.phone && r.status === 'accepted');
    if (recent.some(r => r.phone === c.phone && r.status === 'awaiting_acceptance') || reqs.some(r => r.order_id && !paidSet.has(r.order_id))) return 'ordered';
    if (paidPhones.includes(c.phone) || reqs.some(r => r.order_id && paidSet.has(r.order_id))) return 'paid';
    if (reqs.length) return 'ordered';
    if (q === 'new') return 'new';
    return 'in_service';
  };
  const matches = (c: Conv) => `${c.name ?? ''} ${c.phone} ${c.last_message ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
  const columns = TABS.filter(t => period === 'today' || t.key === 'archived');
  const itemsFor = (key: Tab) => sortQueue(convs.filter(c => situation(c) === key && matches(c) && (!waitingOnly || needsStaffReply(c))), period === 'history' ? 'recent' : queueOrder);
  const totalVisible = columns.reduce((n, column) => n + itemsFor(column.key).length, 0);
  const waiting = sortQueue(convs.filter(c => columns.some(column => column.key === situation(c)) && situation(c) !== 'archived' && matches(c) && needsStaffReply(c)), 'arrival');
  const conv = convs.find(c => c.phone === active);
  const activeRequest = requests.find(r => r.phone === active);
  const linked: Order[] = useMemo(() => active ? orders.filter(o => o.customerPhone && normalizePhone(o.customerPhone) === active).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8) : [], [orders, active]);
  const windowOpen = conv?.last_inbound_at ? Date.now() - new Date(conv.last_inbound_at).getTime() < 24 * 3600_000 : false;
  const orderMsg = (o: Order) => `Olá${o.customer ? `, ${o.customer}` : ''}! Pedido #${o.number}: ${STATUS_LABEL[o.status] ?? o.status}.`;
  const linkableOrders = (o: Order) => o.status !== 'cancelado' && o.paymentStatus !== 'pago' && !o.payments.length;

  async function linkReceipt(messageId: string, order: Order) {
    setBusy(true);
    try {
      const r = await supabase.rpc('register_staff_receipt', { _message: messageId, _order: order.id, _path: null } as never);
      if (r.error) throw r.error;
      toast.success(`Comprovante vinculado ao pedido #${order.number} — conferência pendente no caixa`);
      setLinkingMsg(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao vincular';
      if (msg.includes('ainda não baixado')) {
        try { await retryFn({ data: { messageId } }); toast.message('Arquivo recuperado — tente vincular de novo'); }
        catch (re) { toast.error(re instanceof Error ? re.message : 'Não foi possível processar o arquivo'); }
      } else toast.error(msg);
    } finally { setBusy(false); }
  }
  function canDrop(phone: string, target: Tab) {
    const conversation = convs.find(c => c.phone === phone);
    if (!conversation) return false;
    const source = situation(conversation);
    if (target === 'archived') return source !== 'archived';
    if (target === 'in_service') return source === 'new';
    return false;
  }
  async function dropConversation(event: DragEvent, target: Tab) {
    event.preventDefault();
    setDropTarget(null);
    const phone = dragPhone || event.dataTransfer.getData('text/plain');
    setDragPhone(null);
    if (!phone || !canDrop(phone, target)) { if (phone) toast.message('Essa etapa muda automaticamente com o pedido ou pagamento'); return; }
    await runAction(phone, target === 'archived' ? 'finish' : 'take', undefined, target === 'archived' ? 'Conversa arquivada' : 'Atendimento assumido');
  }
  function changePeriod(next: 'today' | 'history') {
    setPeriod(next);
    setActive(null);
    setConvs([]);
    setSearch('');
    setWaitingOnly(false);
  }

  return <section className="mx-auto flex min-h-full max-w-[1800px] flex-col gap-4 text-foreground">
    <header className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/10 text-success"><MessageCircle size={23} /></span>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Atendimento WhatsApp</h1>
        <p className="text-xs text-muted-foreground">Organize a equipe sem perder o andamento dos pedidos.</p>
      </div>
      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', status?.connected ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {status === null ? 'Verificando conexão' : status.connected ? `Conectado · ${status.phone}` : 'Desconectado'}
      </span>
      {cfg?.account_state === 'blocked' && <span className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle size={14} /> Conta bloqueada pela Meta</span>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {cfg && <WhatsAppRobotToggle enabled={cfg.auto_reply_enabled} onChange={enabled => setCfg(current => current ? { ...current, auto_reply_enabled: enabled } : current)} />}
        <Button variant="outline" size="sm" onClick={() => { void checkStatus(); void loadConvs(); void loadCfg(); }}><RefreshCw /> Atualizar</Button>
        {isAdmin && status?.connected && <Button variant="outline" size="sm" disabled={busy} onClick={() => void syncHistory()}><History /> Importar</Button>}
        {isAdmin && <Button variant="outline" size="sm" onClick={() => setShowCfg(v => !v)}><Settings2 /> Configurações</Button>}
      </div>
    </header>

    {status && !status.connected && <p className="rounded-xl border-l-2 border-l-warning bg-warning/10 p-3 text-sm">O WhatsApp da loja não está conectado. A conexão é feita uma vez pela conta da Meta e fica salva. {status.reason}</p>}
    {isAdmin && showCfg && cfg && <WhatsAppBusinessSettings initial={cfg.business} enabled={cfg.auto_reply_enabled} quick={cfg.quick_replies} onSaved={() => { void loadCfg(); setShowCfg(false); }} />}

    {(requests.length > 0 || jobErrors.length > 0) && <div className="grid gap-3 lg:grid-cols-2">
      {requests.length > 0 && <details open className="rounded-xl border border-warning/30 bg-warning/5 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-warning">Pedidos aguardando aceite · {requests.length}</summary>
        <div className="mt-3 space-y-2">{requests.filter(r => period === 'history' || isStoreToday(r.created_at)).map(r => <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5 text-sm">
          <Button variant="ghost" size="sm" onClick={() => openConversation(r.phone)}>{r.public_code ? `Catálogo ${r.public_code} · ` : ''}{convs.find(c => c.phone === r.phone)?.name || `+${r.phone}`}</Button>
          <span className="font-mono font-semibold">{brl(r.quoted_total)}</span><span className="text-xs text-muted-foreground">{waitingTime(r.created_at)}</span>
          <div className="ml-auto flex gap-2"><EditWhatsAppRequest key={r.id + r.quoted_total} id={r.id} request={r.request} onSaved={() => void loadRequests()} /><Button size="sm" disabled={busy} onClick={() => void accept(r.id, true)}>Aceitar e enviar</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void accept(r.id, false)}>Recusar</Button></div>
        </div>)}</div>
      </details>}
      {jobErrors.length > 0 && <details className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-destructive">Envios que precisam de revisão · {jobErrors.length}</summary>
        <div className="mt-2 space-y-1">{jobErrors.map(j => <div key={j.id} className="rounded-lg bg-card p-2"><Button variant="ghost" size="sm" onClick={() => openConversation(j.phone)}>+{j.phone}</Button><span className="text-xs text-muted-foreground">{j.state === 'unknown' ? 'Resultado desconhecido; confira antes de reenviar' : j.processing_error}</span></div>)}</div>
      </details>}
    </div>}

    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex rounded-lg bg-background p-1">
        <Button size="sm" variant={period === 'today' ? 'secondary' : 'ghost'} aria-pressed={period === 'today'} onClick={() => changePeriod('today')}>Hoje</Button>
        <Button size="sm" variant={period === 'history' ? 'secondary' : 'ghost'} aria-pressed={period === 'history'} onClick={() => changePeriod('history')}><History /> Histórico</Button>
      </div>
      <div className="relative min-w-[220px] flex-1 sm:max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input aria-label="Buscar conversas no quadro" className="field h-10 pl-9" placeholder="Buscar nome, telefone ou mensagem" value={search} onChange={e => setSearch(e.target.value)} />
        {search && <Button variant="ghost" size="icon" aria-label="Limpar busca" className="absolute right-0.5 top-0.5 h-9 w-9" onClick={() => setSearch('')}><X /></Button>}
      </div>
      <span className="text-xs text-muted-foreground">{totalVisible} {totalVisible === 1 ? 'conversa' : 'conversas'}</span>
      {period === 'today' && <Button className="ml-auto" size="sm" variant="ghost" onClick={async () => { if (!await confirmAction('Esconder todas as mensagens de hoje da tela? Elas continuam no Histórico.')) return; const now = Date.now(); localStorage.setItem('ultrabrasa-wa-cleared-at', String(now)); setClearedAt(now); setActive(null); setConvs([]); setMsgs([]); }}>Limpar visualização</Button>}
    </div>

    {period === 'today' && <div className="flex flex-wrap items-center gap-3 px-1">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Ordem das conversas">
        <Button size="sm" variant={queueOrder === 'arrival' ? 'secondary' : 'ghost'} aria-pressed={queueOrder === 'arrival'} onClick={() => setQueueOrder('arrival')}><Clock3 /> Ordem de chegada</Button>
        <Button size="sm" variant={queueOrder === 'recent' ? 'secondary' : 'ghost'} aria-pressed={queueOrder === 'recent'} onClick={() => setQueueOrder('recent')}>Mais recentes</Button>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium"><input type="checkbox" className="h-4 w-4 accent-primary" checked={waitingOnly} onChange={e => setWaitingOnly(e.target.checked)} /> Aguardando resposta · {waiting.length}</label>
      <Button size="sm" className="ml-auto" disabled={!waiting.length} onClick={() => { const next = waiting[0]; if (next) openConversation(next.phone); }}>Abrir próximo <ArrowRight /></Button>
    </div>}

    <div className="flex min-h-[560px] snap-x gap-3 overflow-x-auto pb-3">
      {columns.map(column => {
        const items = itemsFor(column.key);
        const Icon = column.icon;
        const highlighted = dropTarget === column.key;
        return <section key={column.key} aria-label={`${column.label}: ${items.length} conversas`} onDragOver={e => { if (dragPhone && canDrop(dragPhone, column.key)) { e.preventDefault(); setDropTarget(column.key); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }} onDrop={e => void dropConversation(e, column.key)} className={cn('flex w-[84vw] min-w-[280px] max-w-[350px] flex-1 snap-start flex-col rounded-2xl border border-t-4 bg-card/60 shadow-sm transition-colors xl:w-auto xl:max-w-none', column.tone, highlighted && 'border-primary bg-primary/5 ring-2 ring-primary/20')}>
          <header className="border-b p-3.5">
            <div className="flex items-center gap-2"><Icon size={17} className="text-muted-foreground" /><h2 className="text-sm font-bold">{column.label}</h2><span className={cn('ml-auto grid h-6 min-w-6 place-items-center rounded-full px-2 text-xs font-bold', column.badge)}>{items.length}</span></div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{column.hint}</p>
          </header>
          <div className="max-h-[calc(100dvh-300px)] min-h-[420px] flex-1 space-y-2.5 overflow-y-auto p-2.5">
            {loadingConvs && !convs.length ? <p className="p-4 text-center text-xs text-muted-foreground">Carregando conversas…</p> : !items.length ? <div className="grid min-h-36 place-items-center rounded-xl border border-dashed p-4 text-center"><div><Icon className="mx-auto mb-2 text-muted-foreground/50" size={22} /><p className="text-xs text-muted-foreground">{search ? 'Nenhum resultado nesta etapa.' : highlighted ? 'Solte a conversa aqui.' : 'Nenhuma conversa nesta etapa.'}</p></div></div> : items.map((c, index) => {
              const req = requests.find(r => r.phone === c.phone);
              const wait = waitingTime(c.awaiting_since);
              return <article key={c.phone} draggable={column.key !== 'archived'} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.phone); setDragPhone(c.phone); }} onDragEnd={() => { setDragPhone(null); setDropTarget(null); }} className={cn('group rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md', cardBusy === c.phone && 'pointer-events-none opacity-60')}>
                <button type="button" className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => openConversation(c.phone)} aria-label={`Abrir conversa com ${c.name || c.phone}`}>
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">{(c.name || c.phone).trim().slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{c.name || `+${c.phone}`}</span><time className="shrink-0 text-[10px] font-normal text-muted-foreground">{messageTime(c.last_message_at)}</time></span><span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">+{c.phone}</span></span>
                    {c.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-success px-1 text-[10px] font-bold text-background">{c.unread}</span>}
                  </div>
                  <p className="mt-2.5 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">{c.last_message || 'Nenhuma mensagem'}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {queueOrder === 'arrival' && period === 'today' && <span className="rounded-md bg-secondary px-1.5 py-1 text-[10px] font-semibold text-secondary-foreground">{index + 1}º na coluna</span>}
                    {needsStaffReply(c) && <span className="rounded-md bg-warning/10 px-1.5 py-1 text-[10px] font-semibold text-warning">Aguardando resposta</span>}
                    {c.assigned_name && <span className="rounded-md bg-secondary px-1.5 py-1 text-[10px] text-secondary-foreground">{c.assigned_name}</span>}
                    {c.automation_paused ? <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-1 text-[10px] text-muted-foreground"><Bot size={11} /> Robô pausado</span> : <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-1 text-[10px] text-success"><Bot size={11} /> Robô ativo</span>}
                    {wait && <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-1.5 py-1 text-[10px] text-warning"><Clock3 size={11} /> {wait}</span>}
                  </div>
                  {req && <div className="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-2 text-[11px]"><span className="font-semibold text-warning">Pedido para conferir · {brl(req.quoted_total)}</span><span className="mt-0.5 flex items-center gap-1 text-muted-foreground">Abrir resumo <ArrowRight size={11} /></span></div>}
                </button>
                <div className="mt-2.5 flex items-center gap-1 border-t pt-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openConversation(c.phone)}>Abrir <ArrowRight /></Button>
                  <div className="ml-auto flex gap-1">
                    {column.key === 'new' && <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={cardBusy === c.phone} onClick={() => void runAction(c.phone, 'take', undefined, 'Atendimento assumido')}><UserRound /> Assumir</Button>}
                    {period === 'today' && column.key !== 'archived' && <Button variant="ghost" size="icon" className="h-7 w-7" title="Arquivar conversa" aria-label={`Arquivar conversa com ${c.name || c.phone}`} disabled={cardBusy === c.phone} onClick={() => void runAction(c.phone, 'finish', undefined, 'Conversa arquivada')}><Archive /></Button>}
                  </div>
                </div>
              </article>;
            })}
          </div>
        </section>;
      })}
    </div>

    <details className="rounded-xl border bg-card p-3"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><ReceiptText size={16} /> Comprovantes e conferência de pagamento</summary><div className="mt-3"><ReceiptReview /></div></details>

    {active && <div className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-sm sm:p-3" onMouseDown={e => { if (e.target === e.currentTarget) setActive(null); }}>
      <section role="dialog" aria-modal="true" aria-label={`Conversa com ${conv?.name || active}`} className="flex h-full w-full max-w-6xl flex-col overflow-hidden border bg-card shadow-2xl sm:rounded-2xl">
        <header className="shrink-0 border-b bg-card p-3 sm:p-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">{(conv?.name || active).trim().slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><h2 className="truncate font-bold">{conv?.name || `+${active}`}</h2><p className="truncate text-xs text-muted-foreground">+{active} · {windowOpen ? 'Janela de atendimento aberta' : 'Fora da janela de 24 h'}</p></div>
            <span className={cn('hidden rounded-full px-2.5 py-1 text-[11px] sm:inline-flex', windowOpen ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>{windowOpen ? 'Pode responder' : 'Somente modelos aprovados'}</span>
            <Button variant="outline" size="sm" className="lg:hidden" aria-pressed={showDetails} onClick={() => setShowDetails(v => !v)}><PanelRight /> Detalhes</Button>
            <Button variant="ghost" size="icon" aria-label="Fechar conversa" onClick={() => setActive(null)}><X /></Button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => void action('take')}><UserRound /> Assumir</Button>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => void action('resume')}><Bot /> Retomar robô</Button>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => void action('waiting')}><Clock3 /> Aguardar cliente</Button>
            {onBuildOrder && <Button size="sm" className="shrink-0" onClick={() => onBuildOrder(active, conv?.name ?? '')}><ShoppingBag /> Montar pedido</Button>}
            <select aria-label="Transferir para" className="field h-8 w-auto min-w-36 shrink-0 py-0 text-xs" value={transferTo} onChange={e => setTransferTo(e.target.value)}><option value="">Transferir para…</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <Button size="sm" variant="outline" className="shrink-0" disabled={!transferTo} onClick={() => void action('transfer')}>Transferir</Button>
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void action('finish')}><Archive /> Arquivar</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{conv?.assigned_name || 'Sem responsável'} · Robô {conv?.automation_paused ? 'pausado durante o atendimento humano' : 'disponível'}</p>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className={cn('min-h-0 min-w-0 flex-col', showDetails ? 'hidden lg:flex' : 'flex')}>
            {activeRequest && <div className="m-3 mb-0 shrink-0 rounded-xl border border-warning/30 bg-warning/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold text-warning">Pedido pronto para conferência</p><p className="text-xs text-muted-foreground">Confira os dados antes de enviar à cozinha.</p></div><span className="rounded-full bg-warning/15 px-2 py-1 font-mono text-xs font-bold text-warning">{brl(activeRequest.quoted_total)}</span></div>
              <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Conferir dados do pedido</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-card p-2 text-xs">{JSON.stringify(activeRequest.request, null, 2)}</pre></details>
              <div className="mt-3 flex gap-2"><EditWhatsAppRequest key={activeRequest.id + activeRequest.quoted_total} id={activeRequest.id} request={activeRequest.request} onSaved={() => void loadRequests()} /><Button size="sm" disabled={busy} onClick={() => void accept(activeRequest.id, true)}>Confirmar e enviar</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void accept(activeRequest.id, false)}>Recusar pedido</Button></div>
            </div>}
            <div className="min-h-0 flex-1 overflow-y-auto bg-background/40 p-3 sm:p-5">
              <div className="mx-auto max-w-3xl space-y-2.5">
                {!msgs.length && <p className="py-16 text-center text-sm text-muted-foreground">Nenhuma mensagem neste período.</p>}
                {msgs.map(m => <div key={m.id} className={cn('max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[78%]', m.direction === 'in' ? 'rounded-tl-md border bg-card' : 'ml-auto rounded-tr-md border border-success/20 bg-success/10')}>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    {m.source === 'auto' && 'automática · '}{m.sent_by_name && `${m.sent_by_name} · `}{m.source === 'phone' && 'pelo celular · '}{m.source === 'history' && 'importada · '}{new Date(m.provider_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    {m.direction === 'out' && (m.status === 'read' ? <CheckCheck size={12} className="text-success" /> : m.status === 'delivered' ? <CheckCheck size={12} /> : m.status === 'failed' ? <AlertTriangle size={12} className="text-destructive" /> : <Check size={12} />)}
                  </div>
                  {m.status === 'failed' && m.error && <div className="mt-1 text-[10px] text-destructive">{m.error.slice(0, 160)}</div>}
                  {m.direction === 'in' && ['image', 'document'].includes(m.kind) && <div className="mt-2">
                    {linkingMsg === m.id ? <div className="space-y-2 rounded-lg border bg-background p-3"><p className="text-[11px] font-semibold">Vincular a qual pedido?</p><div className="flex flex-wrap gap-1">{linked.filter(linkableOrders).map(o => <Button key={o.id} size="sm" variant="outline" disabled={busy} onClick={() => void linkReceipt(m.id, o)}>#{o.number} · {brl(o.items.reduce((a, i) => a + i.price * i.qty, 0))}</Button>)}</div>{!linked.filter(linkableOrders).length && <p className="text-[11px] text-muted-foreground">Nenhum pedido ativo deste cliente aguardando pagamento.</p>}<Button size="sm" variant="ghost" onClick={() => setLinkingMsg(null)}>Cancelar</Button></div> : <Button size="sm" variant="outline" disabled={busy} onClick={() => { const options = linked.filter(linkableOrders); if (options.length === 1 && options[0]) void linkReceipt(m.id, options[0]); else setLinkingMsg(m.id); }}>Vincular comprovante ao pedido</Button>}
                  </div>}
                </div>)}
                <div ref={messagesEnd} />
              </div>
            </div>
            {cfg && cfg.quick_replies.length > 0 && <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t bg-card p-2.5">{cfg.quick_replies.map((q, i) => <Button key={i} variant="outline" size="sm" className="shrink-0" onClick={() => write(q)}>{q.slice(0, 38)}</Button>)}</div>}
            <div className="flex shrink-0 items-end gap-2 border-t bg-card p-3">
              <textarea aria-label="Mensagem" className="field max-h-32 min-h-11 flex-1 resize-y" rows={1} maxLength={4000} value={text} onChange={e => write(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Escreva uma mensagem" />
              <Button className="h-11" disabled={busy || !text.trim() || !status?.connected} onClick={() => void send()}><Send /> <span className="hidden sm:inline">Enviar</span></Button>
              <Button className="h-11 w-11" size="icon" variant="outline" title="Enviar cardápio PDF" aria-label="Enviar cardápio PDF" disabled={!cfg?.business.pdfPath || busy} onClick={() => { void pdfFn({ data: { phone: active } }).then(() => toast.message('PDF na fila de envio')).catch(e => toast.error(e.message)); }}><FileText /></Button>
            </div>
          </div>

          <aside className={cn('min-h-0 flex-col space-y-4 overflow-y-auto border-l bg-card p-4 text-sm', showDetails ? 'flex' : 'hidden lg:flex')}>
            <WhatsAppCustomerCard phone={active} />
            <section className="space-y-2"><h3 className="font-bold">Notas internas</h3>{notes.map(n => <div key={n.id} className="rounded-lg border-l-2 border-l-warning bg-warning/5 p-2 text-xs">{n.body}<span className="mt-1 block text-muted-foreground">{n.author_name}</span></div>)}<textarea aria-label="Nota interna" className="field" value={note} onChange={e => setNote(e.target.value)} placeholder="Somente para a equipe" /><Button size="sm" variant="outline" disabled={!note.trim() || cardBusy === active} onClick={() => void action('note')}>Salvar nota interna</Button></section>
            <section className="space-y-2"><div className="flex items-center justify-between gap-2"><h3 className="font-bold">Pedidos deste cliente</h3><span className="text-xs text-muted-foreground">{linked.length}</span></div><ReceiptRegistration phone={active} onSaved={() => void loadMsgs(active)} />
              {linked.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum pedido com este WhatsApp.</p> : linked.map(o => <div key={o.id} className={cn('space-y-2 rounded-xl border bg-background/40 p-3', orderId === o.id && 'border-primary')}>
                <div className="flex justify-between gap-2"><span className="font-semibold">#{o.number} · {o.type}</span><span className="text-xs text-muted-foreground">{STATUS_LABEL[o.status] ?? o.status}</span></div>
                <div className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · <span className="font-mono text-foreground">{brl(o.items.reduce((a, i) => a + i.price * i.qty, 0))}</span></div>
                <div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={() => setOrderId(orderId === o.id ? '' : o.id)}>{orderId === o.id ? 'Vinculado' : 'Vincular'}</Button><Button size="sm" variant="ghost" onClick={() => { setOrderId(o.id); write(orderMsg(o)); }}>Avisar status</Button>{o.status !== 'cancelado' && <ReceiptRegistration phone={active} orderId={o.id} />}</div>
              </div>)}
            </section>
          </aside>
        </div>
      </section>
    </div>}
  </section>;
}
