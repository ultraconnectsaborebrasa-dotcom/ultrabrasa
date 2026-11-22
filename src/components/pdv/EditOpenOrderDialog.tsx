import { useMemo, useState } from 'react';
import { LoaderCircle, Minus, PackagePlus, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { brl } from '@/lib/pdv-store';
import { canEditOpenOrder, openOrderTotals } from '@/lib/open-order-edit';
import { Button } from '@/components/ui/button';

export type EditableOpenOrderProduct = { id: string; name: string; category: string; price: number; stock: number | null; active: boolean };
export type EditableOpenOrderItem = { uid?: string | undefined; productId?: string | undefined; name: string; qty: number; price: number; note?: string | undefined };
export type EditableOpenOrder = {
  id: string;
  number: number;
  status: string;
  note?: string | undefined;
  paymentStatus?: string | undefined;
  hasPayment?: boolean | undefined;
  payments?: unknown[] | undefined;
  discount?: number | undefined;
  fee?: number | undefined;
  serviceFee?: boolean | undefined;
  items: EditableOpenOrderItem[];
};
type DraftItem = { key: string; uid?: string | undefined; productId: string; name: string; qty: number; price: number; note: string };

export function EditOpenOrderDialog({ order, products, serviceFeePct, onClose, onSaved }: {
  order: EditableOpenOrder;
  products: EditableOpenOrderProduct[];
  serviceFeePct: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<DraftItem[]>(() => order.items.map((item, index) => ({
    key: item.uid ?? `legacy-${index}`,
    uid: item.uid,
    productId: item.productId ?? '',
    name: item.name,
    qty: item.qty,
    price: item.price,
    note: item.note ?? '',
  })));
  const [note, setNote] = useState(order.note ?? '');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const originalQuantity = useMemo(() => order.items.reduce<Record<string, number>>((result, item) => {
    if (item.productId) result[item.productId] = (result[item.productId] ?? 0) + item.qty;
    return result;
  }, {}), [order.items]);
  const totals = openOrderTotals({ ...order, items }, serviceFeePct);
  const visibleProducts = products.filter(product => product.active && product.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));

  function available(productId: string) {
    const product = products.find(item => item.id === productId);
    if (!product || product.stock === null) return null;
    return product.stock + (originalQuantity[productId] ?? 0);
  }

  function changeQuantity(key: string, delta: number) {
    setItems(current => current.flatMap(item => {
      if (item.key !== key) return [item];
      const quantity = item.qty + delta;
      if (quantity <= 0) return [];
      const limit = available(item.productId);
      if (limit !== null && quantity > limit) {
        toast.warning(`Estoque insuficiente de ${item.name}. Considere as unidades que já estavam na comanda.`);
        return [item];
      }
      return [{ ...item, qty: quantity }];
    }));
  }

  function add(product: EditableOpenOrderProduct) {
    if (product.price <= 0) { toast.error(`Defina o preço de ${product.name} antes de adicionar.`); return; }
    const existing = items.find(item => item.productId === product.id);
    if (existing) { changeQuantity(existing.key, 1); return; }
    const limit = available(product.id);
    if (limit !== null && limit < 1) { toast.warning(`Sem estoque disponível de ${product.name}.`); return; }
    const key = `new-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    setItems(current => [...current, { key, productId: product.id, name: product.name, qty: 1, price: product.price, note: '' }]);
  }

  async function save() {
    if (!canEditOpenOrder(order)) { toast.error('Esta comanda não está mais disponível para edição.'); return; }
    if (!items.length || items.some(item => !item.productId)) { toast.error('Mantenha ao menos um produto com cadastro válido.'); return; }
    setBusy(true);
    try {
      const payload = items.map(item => ({
        ...(item.uid ? { uid: item.uid } : {}),
        productId: item.productId,
        qty: item.qty,
        note: item.note.trim(),
      }));
      const { error } = await supabase.rpc('update_pdv_open_order' as never, { order_id: order.id, input_items: payload, order_note: note.trim() } as never);
      if (error) throw new Error(error.message);
      toast.success(`Comanda #${order.number} atualizada.`);
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a comanda.');
    } finally {
      setBusy(false);
    }
  }

  return <div role="dialog" aria-modal="true" aria-label={`Editar comanda #${order.number}`} className="fixed inset-0 z-50 overflow-y-auto bg-background/95 p-3 sm:p-6">
    <div className="mx-auto max-w-6xl space-y-4 rounded-2xl border bg-card p-4 shadow-lg sm:p-5">
      <header className="flex items-start gap-3 border-b pb-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><PackagePlus size={22} /></span>
        <div className="min-w-0 flex-1"><h2 className="text-xl font-bold">Editar comanda #{order.number}</h2><p className="text-sm text-muted-foreground">Adicione ou remova produtos e ajuste as observações. O pagamento e a etapa atual não mudam.</p></div>
        <Button variant="ghost" size="icon" aria-label="Fechar edição" disabled={busy} onClick={onClose}><X size={20} /></Button>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-3">
          <div><h3 className="font-semibold">Adicionar produtos</h3><p className="text-xs text-muted-foreground">O estoque considera as unidades que já estavam na comanda.</p></div>
          <label className="relative block"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><input aria-label="Buscar produto para adicionar" className="field pl-9" placeholder="Buscar no cardápio" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {visibleProducts.map(product => {
              const remaining = available(product.id);
              return <button type="button" key={product.id} disabled={busy || remaining === 0} onClick={() => add(product)} className="rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary disabled:opacity-45">
                <span className="block text-[10px] uppercase text-muted-foreground">{product.category}</span><b className="mt-1 block text-sm">{product.name}</b><span className="mt-2 block font-mono text-primary">{brl(product.price)}</span><span className="mt-1 block text-xs text-muted-foreground">{remaining === null ? 'Sem controle de estoque' : `${remaining} disponível(is) nesta edição`}</span>
              </button>;
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div><h3 className="font-semibold">Itens da comanda</h3><p className="text-xs text-muted-foreground">Use a lixeira para remover. A comanda precisa manter ao menos um item.</p></div>
          <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
            {items.map(item => <article key={item.key} className="space-y-2 rounded-xl border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-32 flex-1"><b className="block text-sm">{item.name}</b><span className="text-xs text-muted-foreground">{brl(item.price)} cada</span></div>
                <div className="flex items-center rounded-lg border">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Diminuir ${item.name}`} disabled={busy} onClick={() => changeQuantity(item.key, -1)}><Minus size={15} /></Button>
                  <span className="w-8 text-center font-mono text-sm">{item.qty}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Aumentar ${item.name}`} disabled={busy} onClick={() => changeQuantity(item.key, 1)}><Plus size={15} /></Button>
                </div>
                <b className="w-24 text-right font-mono text-sm">{brl(item.price * item.qty)}</b>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${item.name}`} disabled={busy} onClick={() => setItems(current => current.filter(currentItem => currentItem.key !== item.key))}><Trash2 size={16} /></Button>
              </div>
              <input aria-label={`Observação de ${item.name}`} className="field text-sm" maxLength={200} placeholder="Observação deste item" value={item.note} onChange={event => setItems(current => current.map(currentItem => currentItem.key === item.key ? { ...currentItem, note: event.target.value } : currentItem))} />
            </article>)}
            {!items.length && <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning">A comanda ficou sem itens. Adicione um produto ou cancele a edição; para excluir a comanda, use o botão de cancelamento do pedido.</p>}
          </div>
          <label className="block text-sm font-medium">Observações gerais<textarea aria-label="Observações gerais da comanda" className="field mt-1 min-h-20" maxLength={1000} placeholder="Informações para a cozinha e o atendimento" value={note} onChange={event => setNote(event.target.value)} /></label>
        </section>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t pt-4">
        <div className="min-w-48 flex-1 text-sm"><span className="text-muted-foreground">Subtotal {brl(totals.subtotal)}{totals.service > 0 ? ` · Serviço ${brl(totals.service)}` : ''}</span><div className="font-display text-2xl font-bold">Total {brl(totals.total)}</div></div>
        <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button disabled={busy || !items.length || items.some(item => !item.productId)} onClick={() => void save()}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}{busy ? 'Salvando…' : 'Salvar alterações'}</Button>
      </footer>
    </div>
  </div>;
}
