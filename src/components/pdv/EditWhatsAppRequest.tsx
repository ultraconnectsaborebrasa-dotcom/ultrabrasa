import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { requestPaymentMethod } from '@/lib/whatsapp-payment';
import { customerNameWithProfile } from '@/lib/whatsapp-business';
import { addProductToRequestItems, type EditableProduct, type EditableRequestItem } from '@/lib/whatsapp-request-editor';
import { brl } from '@/lib/pdv-store';

type Req = { customer?: string; payment?: string; note?: string; type?: string; items?: EditableRequestItem[]; summary?: EditableRequestItem[]; delivery?: { address?: { street?: string; number?: string; neighborhood?: string; reference?: string } } };

export function EditWhatsAppRequest({ id, request, whatsappName, onSaved }: { id: string; request: unknown; whatsappName: string | null | undefined; onSaved: () => void }) {
  const r = (request ?? {}) as Req;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState(() => customerNameWithProfile(r.customer ?? '', whatsappName));
  const [payment, setPayment] = useState(() => requestPaymentMethod(r));
  const [note, setNote] = useState(r.note ?? '');
  const a = r.delivery?.address ?? {};
  const [addr, setAddr] = useState({ street: a.street ?? '', number: a.number ?? '', neighborhood: a.neighborhood ?? '', reference: a.reference ?? '' });
  const [items, setItems] = useState<EditableRequestItem[]>((r.items ?? []).map(i => {
    const summary = r.summary?.find(s => s.productId === i.productId);
    const price = summary?.price ?? i.price;
    return { ...i, name: summary?.name ?? i.name ?? i.productId, ...(price === undefined ? {} : { price }) };
  }));
  const [products, setProducts] = useState<EditableProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoadingProducts(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('read_pdv_cashier' as never);
        if (!current) return;
        if (error) { toast.error(error.message); return; }
        const rows = (data as unknown as { products?: EditableProduct[] } | null)?.products ?? [];
        setProducts(rows.filter(product => product.active));
      } catch (error) {
        if (current) toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os produtos');
      } finally {
        if (current) setLoadingProducts(false);
      }
    })();
    return () => { current = false; };
  }, [open]);

  const total = useMemo(() => items.reduce((sum, item) => {
    const price = products.find(product => product.id === item.productId)?.price ?? item.price ?? 0;
    return sum + price * item.qty;
  }, 0), [items, products]);

  function addProduct() {
    if (!selectedProduct) { toast.info('Escolha um produto na lista ao lado para adicionar.'); return; }
    const product = products.find(item => item.id === selectedProduct);
    if (!product) { toast.error('Produto não encontrado. Atualize a janela e tente novamente.'); return; }
    setItems(current => addProductToRequestItems(current, product));
    setSelectedProduct('');
  }

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
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Editar pedido antes da cozinha</DialogTitle></DialogHeader>
      <div className="space-y-3 text-sm">
        <label className="block">Nome do cliente<input className="field mt-1 w-full" value={customer} onChange={e => setCustomer(e.target.value)} /></label>
        {whatsappName && <p className="-mt-2 text-xs text-muted-foreground">Nome no WhatsApp: {whatsappName}</p>}

        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="font-semibold">Adicionar produto</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Escolha na lista e toque no botão para incluir na comanda.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <select aria-label="Produto para adicionar" className="field min-w-0 flex-1" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} disabled={loadingProducts}>
              <option value="">{loadingProducts ? 'Carregando produtos…' : 'Escolha um produto do PDV'}</option>
              {products.map(product => <option key={product.id} value={product.id} disabled={product.stock === 0}>{product.name} · {brl(product.price)}{product.stock === 0 ? ' · sem estoque' : ''}</option>)}
            </select>
            <Button type="button" className="shrink-0" onClick={addProduct}><Plus /> Adicionar produto</Button>
          </div>
        </div>

        {delivery && <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2">Rua<input className="field mt-1 w-full" value={addr.street} onChange={e => setAddr({ ...addr, street: e.target.value })} /></label>
          <label>Número<input className="field mt-1 w-full" value={addr.number} onChange={e => setAddr({ ...addr, number: e.target.value })} /></label>
          <label className="col-span-3">Bairro<input className="field mt-1 w-full" value={addr.neighborhood} onChange={e => setAddr({ ...addr, neighborhood: e.target.value })} /></label>
          <label className="col-span-3">Referência<input className="field mt-1 w-full" value={addr.reference} onChange={e => setAddr({ ...addr, reference: e.target.value })} /></label>
        </div>}
        <label className="block">Pagamento<select className="field mt-1 w-full" value={payment} onChange={e => setPayment(e.target.value)}>{['Pix', 'Dinheiro', 'Cartão', 'Crédito', 'Débito'].concat(payment && !['Pix','Dinheiro','Cartão','Crédito','Débito'].includes(payment) ? [payment] : []).map(p => <option key={p}>{p}</option>)}</select></label>

        <p className="font-semibold">Itens da comanda (0 remove)</p>
        <div className="space-y-2">{items.map((item, index) => {
          const price = products.find(product => product.id === item.productId)?.price ?? item.price ?? 0;
          return <div key={item.productId} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2 rounded-lg border p-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0"><span className="block truncate font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{brl(price)} cada</span></div>
            <input aria-label={`Quantidade de ${item.name}`} type="number" min={0} max={50} className="field w-full" value={item.qty} onChange={e => setItems(items.map((x, j) => j === index ? { ...x, qty: Number(e.target.value) } : x))} />
            <input aria-label={`Observação de ${item.name}`} placeholder="Observação" className="field col-span-2 sm:col-span-1" value={item.note ?? ''} onChange={e => setItems(items.map((x, j) => j === index ? { ...x, note: e.target.value } : x))} />
            <span className="col-span-2 text-right font-mono text-xs sm:col-span-1">{brl(price * item.qty)}</span>
          </div>;
        })}</div>
        <div className="flex justify-between border-t pt-3 font-bold"><span>Total com os preços atuais</span><span>{brl(total)}</span></div>
        <label className="block">Observação<textarea className="field mt-1 w-full" value={note} onChange={e => setNote(e.target.value)} /></label>
        <p className="text-xs text-muted-foreground">Ao salvar, o total e os preços são recalculados no servidor. O pedido só vai à cozinha depois do aceite.</p>
      </div>
      <DialogFooter><Button disabled={busy || !items.some(item => item.qty > 0)} onClick={() => void save()}>Salvar alterações</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
