import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

type Item = { productId: string; qty: number; note?: string; name?: string };
type Req = { customer?: string; payment?: string; note?: string; type?: string; items?: Item[]; summary?: Item[]; delivery?: { address?: { street?: string; number?: string; neighborhood?: string; reference?: string } } };

export function EditWhatsAppRequest({ id, request, onSaved }: { id: string; request: unknown; onSaved: () => void }) {
  const r = (request ?? {}) as Req;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState(r.customer ?? '');
  const [payment, setPayment] = useState(r.payment ?? '');
  const [note, setNote] = useState(r.note ?? '');
  const a = r.delivery?.address ?? {};
  const [addr, setAddr] = useState({ street: a.street ?? '', number: a.number ?? '', neighborhood: a.neighborhood ?? '', reference: a.reference ?? '' });
  const [items, setItems] = useState<Item[]>((r.items ?? []).map(i => ({ ...i, name: r.summary?.find(s => s.productId === i.productId)?.name ?? i.productId })));
  async function save() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('wa_edit_request', { _id: id, _patch: { customer, payment, note, address: addr, items: items.map(i => ({ productId: i.productId, qty: i.qty, note: i.note ?? '' })) } });
      if (error) throw new Error(error.message);
      toast.success('Pedido atualizado'); setOpen(false); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao salvar'); } finally { setBusy(false); }
  }
  const delivery = r.type === 'Delivery';
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Editar</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Editar pedido antes da cozinha</DialogTitle></DialogHeader>
      <div className="space-y-2 text-sm">
        <label className="block">Nome<input className="field mt-1 w-full" value={customer} onChange={e => setCustomer(e.target.value)} /></label>
        {delivery && <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2">Rua<input className="field mt-1 w-full" value={addr.street} onChange={e => setAddr({ ...addr, street: e.target.value })} /></label>
          <label>Número<input className="field mt-1 w-full" value={addr.number} onChange={e => setAddr({ ...addr, number: e.target.value })} /></label>
          <label className="col-span-3">Bairro<input className="field mt-1 w-full" value={addr.neighborhood} onChange={e => setAddr({ ...addr, neighborhood: e.target.value })} /></label>
          <label className="col-span-3">Referência<input className="field mt-1 w-full" value={addr.reference} onChange={e => setAddr({ ...addr, reference: e.target.value })} /></label>
        </div>}
        <label className="block">Pagamento<select className="field mt-1 w-full" value={payment} onChange={e => setPayment(e.target.value)}>{['Pix', 'Dinheiro', 'Cartão', 'Crédito', 'Débito'].concat(payment && !['Pix','Dinheiro','Cartão','Crédito','Débito'].includes(payment) ? [payment] : []).map(p => <option key={p}>{p}</option>)}</select></label>
        <p className="font-semibold">Itens (0 remove)</p>
        {items.map((i, k) => <div key={k} className="flex gap-2"><span className="flex-1 self-center">{i.name}</span>
          <input type="number" min={0} max={50} className="field w-16" value={i.qty} onChange={e => setItems(items.map((x, j) => j === k ? { ...x, qty: Number(e.target.value) } : x))} />
          <input placeholder="Obs." className="field flex-1" value={i.note ?? ''} onChange={e => setItems(items.map((x, j) => j === k ? { ...x, note: e.target.value } : x))} /></div>)}
        <label className="block">Observação<textarea className="field mt-1 w-full" value={note} onChange={e => setNote(e.target.value)} /></label>
        <p className="text-xs text-muted-foreground">O total é recalculado com os preços atuais do cardápio.</p>
      </div>
      <DialogFooter><Button disabled={busy} onClick={() => void save()}>Salvar alterações</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
