import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type Card = {
  id: string; name: string; phone: string; nameStatus: 'missing' | 'provisional' | 'confirmed'; profileName: string | null;
  contactStatus: string | null; updatedByName: string | null;
  addresses: { id: string; address: { label?: string; street?: string; number?: string; neighborhood?: string } }[];
  orders: { ref: string; status: string; at: string }[];
};
const NAME_LABEL = { missing: 'Sem nome — pergunte "Como você se chama?"', provisional: 'Nome do perfil (provisório)', confirmed: 'Nome confirmado' };
const CONTACT_LABEL: Record<string, string> = { awaiting_name: 'Aguardando nome', not_synced: 'Cliente antigo — não sincronizado', pending: 'Pendente de sincronização', saved: 'Salvo na agenda', failed: 'Falha na sincronização', review: 'Revisão necessária' };
const ORDER_LABEL: Record<string, string> = { awaiting_acceptance: 'Aguardando aceite', accepted: 'Aceito', rejected: 'Recusado' };

export function WhatsAppCustomerCard({ phone }: { phone: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(''); const [tel, setTel] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await supabase.rpc('wa_customer_card', { _phone: phone });
    if (!r.error) setCard(r.data as Card | null);
  }
  useEffect(() => { setEdit(false); void load(); }, [phone]);

  async function save() {
    if (!card) return;
    setBusy(true);
    const r = await supabase.rpc('update_customer_identity', { _id: card.id, _name: name, _phone: tel });
    setBusy(false);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success('Cadastro atualizado'); setEdit(false); void load();
  }

  if (!card) return null;
  return (
    <div className="space-y-2 border-b pb-3">
      <div className="font-semibold">Cliente</div>
      {!edit ? <>
        <div className="text-base font-bold">{card.name || 'Sem nome'}</div>
        <div className="text-xs text-muted-foreground">+{card.phone}</div>
        <div className={`text-xs ${card.nameStatus === 'confirmed' ? 'text-success' : 'text-warning'}`}>{NAME_LABEL[card.nameStatus]}</div>
        {card.profileName && card.profileName !== card.name && <div className="text-xs text-muted-foreground">Perfil: {card.profileName}</div>}
        {card.contactStatus && <div className="text-xs">Agenda: {CONTACT_LABEL[card.contactStatus] ?? card.contactStatus}</div>}
        {card.updatedByName && <div className="text-xs text-muted-foreground">Corrigido por {card.updatedByName}</div>}
        <Button size="sm" variant="outline" onClick={() => { setName(card.name); setTel(card.phone); setEdit(true); }}>Corrigir nome/telefone</Button>
      </> : <div className="space-y-2">
        <input className="field" aria-label="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field" aria-label="Telefone com país e DDD" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} />
        <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void save()}>Salvar</Button><Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Cancelar</Button></div>
      </div>}
      {card.addresses.length > 0 && <div className="space-y-1">
        <div className="text-xs font-semibold">Endereços salvos — confirme com o cliente antes de usar</div>
        {card.addresses.slice(0, 3).map((a) => <div key={a.id} className="text-xs text-muted-foreground">{[a.address.label, a.address.street, a.address.number, a.address.neighborhood].filter(Boolean).join(', ')}</div>)}
      </div>}
      {card.orders.length > 0 && <div className="space-y-1">
        <div className="text-xs font-semibold">Pedidos recentes</div>
        {card.orders.slice(0, 5).map((o, i) => <div key={i} className="text-xs text-muted-foreground">{o.ref} · {ORDER_LABEL[o.status] ?? o.status} · {new Date(o.at).toLocaleDateString('pt-BR')}</div>)}
      </div>}
    </div>
  );
}
