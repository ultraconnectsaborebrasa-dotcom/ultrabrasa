import { useCallback, useEffect, useState } from 'react';
import { Bot, Check, ChevronDown, ChevronUp, Copy, MessageCircle, RefreshCw, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type Conversation = {
  name: string | null;
  assigned_name: string | null;
  automation_paused: boolean;
};
type Message = {
  id: string;
  direction: string;
  kind: string;
  body: string | null;
  provider_at: string;
};

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const field = document.createElement('textarea');
  field.value = value;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Cópia não disponível');
}

/** Conversa de apoio à montagem manual: copia dados, mas nunca preenche o pedido. */
export function WhatsAppOrderConversation({ phone, onBack, onClose }: { phone: string; onBack: () => void; onClose: () => void }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [conversationResult, messagesResult] = await Promise.all([
      supabase.from('whatsapp_conversations').select('name,assigned_name,automation_paused').eq('phone', phone).maybeSingle(),
      supabase.from('whatsapp_messages').select('id,direction,kind,body,provider_at').eq('phone', phone).order('provider_at', { ascending: false }).limit(200),
    ]);
    if (conversationResult.error || messagesResult.error) {
      toast.error('Não foi possível atualizar a conversa');
    } else {
      setConversation(conversationResult.data);
      setMessages([...(messagesResult.data ?? [])].reverse());
    }
    setLoading(false);
  }, [phone]);

  useEffect(() => { void load(); }, [load]);

  async function copy(value: string, id: string, label: string) {
    try {
      await copyText(value);
      setCopiedId(id);
      toast.success(`${label} copiado`);
      window.setTimeout(() => setCopiedId(current => current === id ? null : current), 1600);
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto da mensagem.');
    }
  }

  const profileName = conversation?.name?.trim() || '';
  return <aside aria-label="Conversa para montar pedido" className="order-first flex max-h-[72dvh] min-h-0 flex-col overflow-hidden rounded-2xl border border-success/30 bg-card shadow-sm xl:order-none xl:sticky xl:top-0 xl:self-start">
    <header className="shrink-0 space-y-3 border-b bg-success/5 p-3">
      <div className="flex items-start gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success/10 text-success"><MessageCircle size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nome no perfil do WhatsApp</p>
          <h2 className="truncate text-base font-bold">{profileName || 'Nome não informado'}</h2>
          <p className="text-xs text-muted-foreground">+{phone}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Fechar painel da conversa" title="Fechar painel" onClick={onClose}><X /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold', conversation?.automation_paused ? 'bg-muted text-muted-foreground' : 'bg-success/10 text-success')}><Bot size={12} /> {conversation?.automation_paused ? 'Robô pausado nesta conversa' : 'Robô ativo'}</span>
        {conversation?.assigned_name && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-secondary-foreground"><UserRound size={12} /> {conversation.assigned_name}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={!profileName} aria-label="Copiar nome do perfil" onClick={() => void copy(profileName, 'profile', 'Nome')}>
          {copiedId === 'profile' ? <Check /> : <Copy />} Copiar nome
        </Button>
        <Button size="sm" variant="outline" onClick={onBack}>Abrir atendimento</Button>
        <Button size="sm" variant="ghost" disabled={loading} aria-label="Atualizar conversa da montagem" onClick={() => void load()}><RefreshCw className={loading ? 'animate-spin' : ''} /> Atualizar</Button>
        <Button size="sm" variant="ghost" className="ml-auto" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
          {expanded ? <ChevronUp /> : <ChevronDown />} {expanded ? 'Ocultar' : 'Mostrar'}
        </Button>
      </div>
    </header>
    {expanded && <>
      <p className="shrink-0 border-b bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">Copie a mensagem que contém endereço ou referência. Nada é preenchido automaticamente.</p>
      <div className="min-h-32 flex-1 space-y-2 overflow-y-auto bg-background/40 p-3">
        {!loading && !messages.length && <p className="py-8 text-center text-xs text-muted-foreground">Nenhuma mensagem encontrada para esta conversa.</p>}
        {messages.map(message => <article key={message.id} className={cn('max-w-[94%] rounded-xl border bg-card p-2.5 text-xs shadow-sm', message.direction === 'out' && 'ml-auto border-success/20 bg-success/5')}>
          <p className="whitespace-pre-wrap break-words">{message.body || (message.kind === 'text' ? '' : `Anexo: ${message.kind}`)}</p>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            <time>{new Date(message.provider_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
            <span>{message.direction === 'in' ? 'Cliente' : 'Loja'}</span>
            {message.direction === 'in' && message.body && <Button variant="ghost" size="sm" className="ml-auto h-6 px-1.5 text-[10px]" aria-label={`Copiar mensagem do cliente: ${message.body.slice(0, 50)}`} onClick={() => void copy(message.body!, message.id, 'Mensagem')}>
              {copiedId === message.id ? <Check /> : <Copy />} Copiar
            </Button>}
          </div>
        </article>)}
      </div>
    </>}
  </aside>;
}
