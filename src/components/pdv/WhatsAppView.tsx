import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, RefreshCw, CheckCheck, Check, AlertTriangle, Settings2, History } from 'lucide-react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { brl, useStore, type Order } from '@/lib/pdv-store';
import { normalizePhone } from '@/lib/pdv-customers';
import { whatsappSend, whatsappStatus, whatsappSyncHistory } from '@/lib/whatsapp.functions';

type Conv = { phone: string; name: string | null; last_message: string | null; last_message_at: string; unread: number; last_inbound_at: string | null };
type Msg = { id: string; direction: string; source: string; body: string | null; status: string; error: string | null; provider_at: string; order_id: string | null };
type Cfg = { auto_reply_enabled: boolean; auto_reply_text: string; quick_replies: string[]; account_state: string; account_event: string | null };
type Status = Awaited<ReturnType<typeof whatsappStatus>>;

const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', cozinha: 'Em preparo', pronto: 'Pronto', pago: 'Pago', cancelado: 'Cancelado', entregue: 'Entregue' };

export function WhatsAppView() {
  const statusFn = useServerFn(whatsappStatus);
  const sendFn = useServerFn(whatsappSend);
  const syncFn = useServerFn(whatsappSyncHistory);
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

  const checkStatus = () => statusFn().then(setStatus).catch(e => setStatus({ connected: false, reason: String(e?.message ?? e) }));
  const loadConvs = async () => { const r = await supabase.from('whatsapp_conversations').select('phone,name,last_message,last_message_at,unread,last_inbound_at').order('last_message_at', { ascending: false }).limit(200); if (!r.error) setConvs(r.data); };
  const loadMsgs = async (phone: string) => { const r = await supabase.from('whatsapp_messages').select('id,direction,source,body,status,error,provider_at,order_id').eq('phone', phone).order('provider_at').limit(500); if (!r.error) setMsgs(r.data); };
  const loadCfg = async () => { const r = await supabase.from('whatsapp_settings').select('auto_reply_enabled,auto_reply_text,quick_replies,account_state,account_event').eq('id', 1).single(); if (!r.error) setCfg({ ...r.data, quick_replies: Array.isArray(r.data.quick_replies) ? r.data.quick_replies as string[] : [] }); };

  useEffect(() => { void checkStatus(); void loadConvs(); void loadCfg(); const t = setInterval(() => void loadConvs(), 5000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!active) return; void loadMsgs(active); void supabase.from('whatsapp_conversations').update({ unread: 0 }).eq('phone', active); const t = setInterval(() => void loadMsgs(active), 4000); return () => clearInterval(t); }, [active]);

  const conv = convs.find(c => c.phone === active);
  const linked: Order[] = useMemo(() => active ? orders.filter(o => o.customerPhone && normalizePhone(o.customerPhone) === active).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8) : [], [orders, active]);
  const windowOpen = conv?.last_inbound_at ? Date.now() - new Date(conv.last_inbound_at).getTime() < 24 * 3600_000 : false;

  async function send(body = text) {
    if (!active || !body.trim()) return;
    setBusy(true);
    try { await sendFn({ data: { phone: active, text: body, orderId: orderId || null } }); setText(''); await loadMsgs(active); await loadConvs(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao enviar'); await loadMsgs(active); }
    finally { setBusy(false); }
  }
  async function saveCfg() {
    if (!cfg) return;
    const quick = cfg.quick_replies.map(q => q.trim()).filter(Boolean).slice(0, 20);
    if (!cfg.auto_reply_text.trim()) { toast.error('Escreva a resposta automática'); return; }
    const r = await supabase.from('whatsapp_settings').update({ auto_reply_enabled: cfg.auto_reply_enabled, auto_reply_text: cfg.auto_reply_text.trim().slice(0, 1000), quick_replies: quick, updated_at: new Date().toISOString() }).eq('id', 1);
    if (r.error) toast.error(r.error.message); else { toast.success('Configurações salvas'); setShowCfg(false); void loadCfg(); }
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
        <Button variant="outline" size="sm" onClick={() => setShowCfg(v => !v)}><Settings2/> Respostas</Button>
      </div>
    </div>
    {status && !status.connected && <p className="border-l-2 border-warning bg-warning/10 p-3 text-sm">O WhatsApp da loja ainda não está conectado. A conexão é feita uma vez pela conta da Meta; depois fica salva. {status.reason}</p>}
    {showCfg && cfg && <div className="space-y-3 rounded-lg border p-4">
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" role="switch" className="h-5 w-5 accent-primary" checked={cfg.auto_reply_enabled} onChange={e => setCfg({ ...cfg, auto_reply_enabled: e.target.checked })}/> Resposta automática ligada (no máximo 1 a cada 12 h por cliente)</label>
      <textarea className="field min-h-20" maxLength={1000} value={cfg.auto_reply_text} onChange={e => setCfg({ ...cfg, auto_reply_text: e.target.value })}/>
      <div className="text-sm text-muted-foreground">Respostas rápidas (uma por linha)</div>
      <textarea className="field min-h-28" value={cfg.quick_replies.join('\n')} onChange={e => setCfg({ ...cfg, quick_replies: e.target.value.split('\n') })}/>
      <Button onClick={() => void saveCfg()}>Salvar</Button>
    </div>}
    <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[280px_minmax(0,1fr)_240px]">
      <ul className="min-h-0 overflow-y-auto rounded-lg border">
        {convs.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nenhuma conversa ainda.</li>}
        {convs.map(c => <li key={c.phone}><button onClick={() => setActive(c.phone)} className={`w-full border-b p-3 text-left ${active === c.phone ? 'bg-primary/10' : 'hover:bg-elevated'}`}>
          <div className="flex justify-between gap-2"><span className="truncate font-semibold">{c.name || `+${c.phone}`}</span>{c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-success px-1 text-[10px] text-background">{c.unread}</span>}</div>
          <div className="truncate text-xs text-muted-foreground">{c.last_message}</div>
        </button></li>)}
      </ul>
      <div className="flex min-h-[360px] flex-col rounded-lg border">
        {!active ? <div className="m-auto text-sm text-muted-foreground">Escolha uma conversa</div> : <>
          <div className="border-b p-3"><div className="font-semibold">{conv?.name || `+${active}`}</div><div className="text-xs text-muted-foreground">+{active} · {windowOpen ? 'Pode responder livremente (janela de 24 h aberta)' : 'Fora da janela de 24 h: a Meta só aceita modelos aprovados'}</div></div>
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
          {cfg && cfg.quick_replies.length > 0 && <div className="flex gap-1 overflow-x-auto border-t p-2">{cfg.quick_replies.map((q, i) => <Button key={i} variant="outline" size="sm" className="shrink-0" onClick={() => setText(q)}>{q.slice(0, 30)}</Button>)}</div>}
          <div className="flex gap-2 border-t p-2">
            <textarea aria-label="Mensagem" className="field min-h-11 flex-1" rows={1} maxLength={4000} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Escreva uma mensagem"/>
            <Button disabled={busy || !text.trim() || !status?.connected} onClick={() => void send()}><Send/> Enviar</Button>
          </div>
        </>}
      </div>
      <aside className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="font-semibold">Pedidos deste cliente</div>
        {!active ? <p className="text-muted-foreground">—</p> : linked.length === 0 ? <p className="text-muted-foreground">Nenhum pedido com este WhatsApp.</p> : linked.map(o => <div key={o.id} className={`rounded border p-2 ${orderId === o.id ? 'border-primary' : ''}`}>
          <div className="flex justify-between"><span>#{o.number} · {o.type}</span><span>{STATUS_LABEL[o.status] ?? o.status}</span></div>
          <div className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {brl(o.items.reduce((a, i) => a + i.price * i.qty, 0))}</div>
          <div className="mt-1 flex gap-1"><Button size="sm" variant="ghost" onClick={() => setOrderId(orderId === o.id ? '' : o.id)}>{orderId === o.id ? 'Vinculado' : 'Vincular'}</Button><Button size="sm" variant="ghost" onClick={() => { setOrderId(o.id); setText(orderMsg(o)); }}>Avisar status</Button></div>
        </div>)}
      </aside>
    </div>
  </section>;
}
