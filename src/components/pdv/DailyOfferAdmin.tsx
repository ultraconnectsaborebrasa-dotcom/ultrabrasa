import { useEffect, useState } from 'react';
import { ExternalLink, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_DAILY_OFFER, type CatalogSettings, type DailyOfferConfig } from '@/lib/catalog';
import { useStore, type Product } from '@/lib/pdv-store';

type Form = {
  productId: string; title: string; description: string; accompaniments: string; active: boolean;
  productAvailable: boolean; price: string; stockControlled: boolean; stock: string; minStock: string;
};

function makeForm(config: DailyOfferConfig | undefined, products: Product[]): Form {
  const offer = config ?? DEFAULT_DAILY_OFFER;
  const product = products.find((p) => p.id === offer.productId && p.category.toLowerCase() === 'marmitas')
    ?? products.find((p) => p.category.toLowerCase() === 'marmitas');
  return {
    productId: product?.id ?? '', title: offer.title, description: offer.description, accompaniments: offer.accompaniments.join('\n'),
    active: offer.active, productAvailable: product?.active ?? false, price: product?.price.toFixed(2) ?? '19.90',
    stockControlled: product?.stock !== null && product?.stock !== undefined, stock: product?.stock?.toString() ?? '0', minStock: product?.minStock.toString() ?? '5',
  };
}

export function DailyOfferAdmin() {
  const products = useStore((s) => s.products);
  const marmitas = products.filter((p) => p.category.toLowerCase() === 'marmitas');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase.from('catalog_settings').select('config').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) { toast.error('Não foi possível carregar a oferta do dia'); return; }
      const config = data?.config as unknown as CatalogSettings | undefined;
      setForm(makeForm(config?.dailyOffer, products));
    });
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => current ? { ...current, [key]: value } : current);
  const selectProduct = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setForm((current) => current ? { ...current, productId: id, productAvailable: product.active, price: product.price.toFixed(2), stockControlled: product.stock !== null, stock: product.stock?.toString() ?? '0', minStock: product.minStock.toString() } : current);
  };

  async function save() {
    if (!form || saving) return;
    const price = Number(form.price.replace(',', '.'));
    const stock = form.stockControlled ? Number(form.stock) : null;
    const minStock = Number(form.minStock);
    const accompaniments = form.accompaniments.split('\n').map((item) => item.trim()).filter(Boolean);
    if (!form.productId || form.title.trim().length < 2 || form.description.trim().length < 2 || !accompaniments.length) { toast.error('Preencha o produto, o conteúdo e os acompanhamentos'); return; }
    if (!(price > 0) || (stock !== null && (!Number.isInteger(stock) || stock < 0)) || !Number.isInteger(minStock) || minStock < 0) { toast.error('Confira o preço e o estoque'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('save_catalog_daily_offer', { _input: {
      productId: form.productId, title: form.title.trim(), description: form.description.trim(), accompaniments,
      active: form.active, productAvailable: form.productAvailable, price, stock, minStock,
    } });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Oferta, preço e estoque atualizados no PDV');
  }

  if (!form) return <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Carregando oferta do dia…</section>;

  return (
    <section className="space-y-4 rounded-xl border border-primary/40 bg-card p-4" aria-labelledby="daily-offer-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="daily-offer-title" className="flex items-center gap-2 font-display text-lg font-bold"><Flame className="h-5 w-5 text-primary" />Marmita do Dia</h3><p className="mt-1 text-sm text-muted-foreground">Conteúdo da página pública. Preço, disponibilidade e estoque alteram o mesmo produto do PDV.</p></div>
        <Button variant="outline" size="sm" asChild><a href="/marmita-do-dia" target="_blank" rel="noreferrer">Abrir página pública<ExternalLink className="h-4 w-4" /></a></Button>
      </div>
      {!marmitas.length ? <p className="text-sm text-warning">Cadastre uma marmita em Produtos antes de configurar a oferta.</p> : <>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm md:col-span-2"><span>Produto do PDV</span><select className="field" value={form.productId} onChange={(e) => selectProduct(e.target.value)}>{marmitas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span>Título</span><Input maxLength={80} value={form.title} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span>Preço promocional (R$)</span><Input inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} /></label>
          <label className="space-y-1 text-sm md:col-span-2"><span>Carnes e descrição do dia</span><Textarea rows={2} maxLength={300} value={form.description} onChange={(e) => set('description', e.target.value)} /></label>
          <label className="space-y-1 text-sm md:col-span-2"><span>Acompanhamentos — um por linha</span><Textarea rows={4} value={form.accompaniments} onChange={(e) => set('accompaniments', e.target.value)} /></label>
        </div>
        <div className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={form.stockControlled} onChange={(e) => set('stockControlled', e.target.checked)} />Controlar quantidade da marmita</label>
          {form.stockControlled && <><label className="space-y-1 text-sm"><span>Quantidade em estoque</span><Input type="number" min={0} step={1} value={form.stock} onChange={(e) => set('stock', e.target.value)} /></label><label className="space-y-1 text-sm"><span>Aviso de poucas unidades a partir de</span><Input type="number" min={0} step={1} value={form.minStock} onChange={(e) => set('minStock', e.target.value)} /></label></>}
          {!form.stockControlled && <p className="text-sm text-muted-foreground md:col-span-2">Sem limite de quantidade. Nenhum aviso de poucas unidades será exibido.</p>}
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />Oferta ativa na página pública</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.productAvailable} onChange={(e) => set('productAvailable', e.target.checked)} />Produto disponível para venda no PDV</label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">Entrega grátis somente em Eunápolis · pedidos das 09:00 às 14:00 · pagamento continua manual.</p>
          <Button disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar oferta do dia'}</Button>
        </div>
      </>}
    </section>
  );
}
