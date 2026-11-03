import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, ShoppingBag, X, MessageCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { brl } from '@/lib/pdv-store';
import { buildOrderMessage, cartTotal, validateCheckout, whatsappLink, type CartLine, type CheckoutForm, type PaymentChoice } from '@/lib/catalog';

const PIX_KEY = '73982423404';
function PixBox() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-primary p-3 text-sm">
      <p className="font-bold">Pix (celular): {PIX_KEY.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')}</p>
      <p>Favorecido: Ultraconnect LTDA</p>
      <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(PIX_KEY).then(() => setCopied(true)); }}>{copied ? 'Chave copiada!' : 'Copiar chave Pix'}</Button>
      <p className="text-muted-foreground">Faça o Pix pelo app do seu banco e envie o comprovante no WhatsApp. A loja confere o pagamento antes de confirmar.</p>
    </div>
  );
}
const emptyForm: CheckoutForm = {
  customer: '', phone: '', type: 'Delivery',
  address: { street: '', number: '', neighborhood: '', complement: '', reference: '' },
  requestedTime: '', payment: null, needChange: false, cashFor: '', note: '',
};
const PAYMENTS: PaymentChoice[] = ['Pix', 'Crédito', 'Débito', 'Dinheiro'];
type Placed = { code: string; link: string };
const PLACED_KEY = 'ub-catalog-last-order';

export function CatalogCheckout({ cart, setCart, open, setOpen }: {
  cart: CartLine[]; setCart: (f: (c: CartLine[]) => CartLine[]) => void; open: boolean; setOpen: (v: boolean) => void;
}) {
  const [form, setForm] = useState<CheckoutForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const keyRef = useRef<string | null>(null);
  const total = cartTotal(cart);

  useEffect(() => {
    try { const s = localStorage.getItem(PLACED_KEY); if (s) setPlaced(JSON.parse(s) as Placed); } catch { /* ignore */ }
    try { const f = localStorage.getItem('ub-catalog-customer'); if (f) setForm((x) => ({ ...x, ...(JSON.parse(f) as Partial<CheckoutForm>) })); } catch { /* ignore */ }
  }, []);

  const set = <K extends keyof CheckoutForm>(k: K, v: CheckoutForm[K]) => { keyRef.current = null; setForm((f) => ({ ...f, [k]: v })); };
  const setAddr = (k: keyof CheckoutForm['address'], v: string) => { keyRef.current = null; setForm((f) => ({ ...f, address: { ...f.address, [k]: v } })); };
  const qty = (id: string, d: number) => { keyRef.current = null; setCart((c) => c.flatMap((l) => l.productId !== id ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: Math.min(99, l.qty + d) }])); };

  async function submit() {
    if (sending) return;
    const problem = validateCheckout(form, cart);
    if (problem) { setError(problem); return; }
    setError(null); setSending(true);
    keyRef.current ??= crypto.randomUUID();
    const { data, error: rpcError } = await supabase.rpc('catalog_place_order', {
      _client_key: keyRef.current,
      _order: {
        customer: form.customer, phone: form.phone, type: form.type, address: form.address, requestedTime: form.requestedTime,
        payment: form.payment, needChange: form.payment === 'Dinheiro' && form.needChange, cashFor: Number(form.cashFor.replace(',', '.')) || 0,
        note: form.note, items: cart.map((l) => ({ productId: l.productId, qty: l.qty, note: l.note })),
      },
    });
    setSending(false);
    if (rpcError || !data) { setError(rpcError?.message || 'Não foi possível registrar o pedido. Tente novamente.'); return; }
    const code = (data as { code: string }).code;
    const p = { code, link: whatsappLink(buildOrderMessage(code, form, cart)) };
    setPlaced(p);
    localStorage.setItem(PLACED_KEY, JSON.stringify(p));
    localStorage.setItem('ub-catalog-customer', JSON.stringify({ customer: form.customer, phone: form.phone, address: form.address }));
    setCart(() => []); keyRef.current = null;
    window.open(p.link, '_blank', 'noopener');
  }

  if (!open) return (
    <>
      {cart.length > 0 && (
        <button onClick={() => setOpen(true)} className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-3xl items-center justify-between rounded-lg bg-primary px-5 py-4 font-bold text-primary-foreground shadow-lg">
          <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" />Ver carrinho · {cart.reduce((s, l) => s + l.qty, 0)}</span><span>{brl(total)}</span>
        </button>
      )}
      {cart.length === 0 && placed && (
        <button onClick={() => setOpen(true)} className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-3xl items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold">
          <CheckCircle2 className="h-4 w-4 text-success" />Pedido {placed.code} registrado · ver detalhes
        </button>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-background/80 backdrop-blur" role="dialog" aria-modal="true" aria-label="Carrinho">
      <div className="flex h-full w-full max-w-lg flex-col border-x border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-display text-xl font-bold">{cart.length ? 'Seu pedido' : 'Pedido registrado'}</h2>
          <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => setOpen(false)}><X /></Button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {!cart.length && placed && (
            <div className="space-y-3 rounded-lg border border-success p-4">
              <p className="flex items-center gap-2 font-bold text-success"><CheckCircle2 className="h-5 w-5" />Pedido {placed.code} registrado</p>
              <p className="text-sm">Seu pedido foi registrado. Toque em <b>enviar</b> no WhatsApp para encaminhar o resumo. A loja confirma o pedido e o pagamento pelo WhatsApp.</p>
              <a href={placed.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-md bg-success px-4 py-3 font-bold text-primary-foreground"><MessageCircle className="h-5 w-5" />Abrir WhatsApp novamente</a>
              <Button variant="outline" className="w-full" onClick={() => { localStorage.removeItem(PLACED_KEY); setPlaced(null); setOpen(false); }}>Fazer novo pedido</Button>
            </div>
          )}
          {!cart.length && !placed && <p className="text-muted-foreground">Seu carrinho está vazio.</p>}
          {cart.length > 0 && <>
            <ul className="space-y-3">
              {cart.map((l) => (
                <li key={l.productId} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{l.name}</span><span className="font-bold">{brl(l.price * l.qty)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="icon" variant="outline" aria-label="Diminuir" onClick={() => qty(l.productId, -1)}><Minus /></Button>
                    <span className="w-8 text-center font-bold">{l.qty}</span>
                    <Button size="icon" variant="outline" aria-label="Aumentar" onClick={() => qty(l.productId, 1)}><Plus /></Button>
                    <input className="field flex-1" placeholder="Observação (ex.: sem cebola)" maxLength={200} value={l.note}
                      onChange={(e) => { keyRef.current = null; const v = e.target.value; setCart((c) => c.map((x) => x.productId === l.productId ? { ...x, note: v } : x)); }} />
                  </div>
                </li>
              ))}
            </ul>

            <fieldset className="space-y-2">
              <legend className="mb-1 font-bold">Seus dados</legend>
              <input className="field" placeholder="Nome" autoComplete="name" value={form.customer} onChange={(e) => set('customer', e.target.value)} />
              <input className="field" placeholder="WhatsApp com DDD" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 font-bold">Entrega ou retirada</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['Delivery', 'Retirada'] as const).map((t) => <Button key={t} variant={form.type === t ? 'default' : 'outline'} onClick={() => set('type', t)}>{t === 'Delivery' ? 'Entrega' : 'Retirada'}</Button>)}
              </div>
              {form.type === 'Delivery' && <div className="grid grid-cols-[1fr_6rem] gap-2">
                <input className="field" placeholder="Rua" value={form.address.street} onChange={(e) => setAddr('street', e.target.value)} />
                <input className="field" placeholder="Número" value={form.address.number} onChange={(e) => setAddr('number', e.target.value)} />
                <input className="field col-span-2" placeholder="Bairro (Eunápolis)" value={form.address.neighborhood} onChange={(e) => setAddr('neighborhood', e.target.value)} />
                <input className="field col-span-2" placeholder="Complemento (opcional)" value={form.address.complement} onChange={(e) => setAddr('complement', e.target.value)} />
                <input className="field col-span-2" placeholder="Ponto de referência (opcional)" value={form.address.reference} onChange={(e) => setAddr('reference', e.target.value)} />
              </div>}
              <input className="field" placeholder="Horário desejado (opcional)" maxLength={40} value={form.requestedTime} onChange={(e) => set('requestedTime', e.target.value)} />
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 font-bold">Pagamento {form.type === 'Delivery' ? 'na entrega' : 'na retirada'}</legend>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENTS.map((p) => <Button key={p} variant={form.payment === p ? 'default' : 'outline'} onClick={() => set('payment', p)}>{p === 'Crédito' || p === 'Débito' ? `Cartão de ${p.toLowerCase()}` : p}</Button>)}
              </div>
              <p className="text-xs text-muted-foreground">Pagamento online ainda não está disponível. Você paga {form.type === 'Delivery' ? 'ao receber' : 'ao retirar'}; a loja confirma o recebimento.</p>
              {form.payment === 'Dinheiro' && <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.needChange} onChange={(e) => set('needChange', e.target.checked)} />Preciso de troco</label>
                {form.needChange && <input className="field" inputMode="decimal" placeholder="Troco para quanto? (R$)" value={form.cashFor} onChange={(e) => set('cashFor', e.target.value)} />}
              </div>}
              {(form.payment === 'Crédito' || form.payment === 'Débito') && form.type === 'Delivery' && <p className="text-sm text-primary">O entregador levará a maquininha.</p>}
              {form.payment === 'Pix' && <PixBox />}
              <textarea className="field" rows={2} maxLength={300} placeholder="Observação geral (opcional)" value={form.note} onChange={(e) => set('note', e.target.value)} />
            </fieldset>

            <div className="space-y-1 rounded-md border border-border p-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{brl(total)}</span></div>
              <div className="flex justify-between"><span>Taxa de entrega</span><span>{brl(0)}</span></div>
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-primary">{brl(total)}</span></div>
            </div>
          </>}
        </div>
        {cart.length > 0 && <div className="space-y-2 border-t border-border p-4">
          {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
          <Button className="h-12 w-full text-base" disabled={sending} onClick={() => void submit()}>{sending ? 'Registrando…' : `Finalizar pedido · ${brl(total)}`}</Button>
        </div>}
      </div>
    </div>
  );
}
