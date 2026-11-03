import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Clock, Truck } from 'lucide-react';
import { getPublicCatalog } from '@/lib/catalog.functions';
import { currentPeriod, groupCatalog, HIGHLIGHT, type CatalogProduct, type Period } from '@/lib/catalog';
import { Brand } from '@/components/pdv/Brand';
import { brl } from '@/lib/pdv-store';

const catalogQuery = queryOptions({ queryKey: ['public-catalog'], queryFn: () => getPublicCatalog(), staleTime: 30_000 });

export const Route = createFileRoute('/cardapio')({
  head: () => ({
    meta: [
      { title: 'Cardápio — Ultraconnect Sabor e Brasa' },
      { name: 'description', content: 'Marmitas, hambúrgueres artesanais e espetinhos na brasa em Eunápolis. Veja o cardápio e faça seu pedido.' },
      { property: 'og:title', content: 'Cardápio — Ultraconnect Sabor e Brasa' },
      { property: 'og:description', content: 'Marmitas no almoço, hambúrgueres e espetinhos à noite. Entrega em Eunápolis.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: CardapioPage,
  errorComponent: ({ error }: { error: Error }) => <div role="alert" className="p-8 text-center text-foreground">{error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-center">Cardápio indisponível.</div>,
});

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-');

function CardapioPage() {
  const { data } = useSuspenseQuery(catalogQuery);
  const [period, setPeriod] = useState<Period | null>(null);
  useEffect(() => { const f = () => setPeriod(currentPeriod(data.settings)); f(); const i = setInterval(f, 60_000); return () => clearInterval(i); }, [data.settings]);
  const groups = useMemo(() => {
    const g = groupCatalog(data.products);
    if (!period || period === 'closed') return g;
    const hl = HIGHLIGHT[period];
    return [...g].sort((a, b) => Number(hl.includes(b[0])) - Number(hl.includes(a[0])));
  }, [data.products, period]);
  const s = data.settings;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Brand />
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold leading-tight">Ultraconnect Sabor e Brasa</h1>
            <p className="text-xs text-muted-foreground">Eunápolis · BA</p>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 pb-3">
          {groups.map(([c]) => (
            <a key={c} href={`#${slug(c)}`} className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:border-primary">{c}</a>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16">
        <section className="mt-4 grid gap-2 rounded-lg border border-border bg-card p-4 text-sm">
          {period === 'closed' && <p className="font-bold text-warning">Loja fechada agora. Você pode ver o cardápio; pedidos antecipados a partir das {s?.lunchStart ?? '10:00'}.</p>}
          {period === 'lunch' && <p className="font-bold text-primary">Almoço: marmitas em destaque.</p>}
          {period === 'night' && <p className="font-bold text-primary">Noite: hambúrgueres e espetinhos em destaque.</p>}
          <p className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" />Pedidos a partir das {s?.lunchStart ?? '10:00'} · entregas começam a sair às {s?.deliveryStart ?? '11:00'}</p>
          {s?.freeDeliveryEunapolis && <p className="flex items-center gap-2 text-success"><Truck className="h-4 w-4" />Entrega grátis para qualquer bairro de Eunápolis</p>}
        </section>

        {groups.map(([cat, items]) => (
          <section key={cat} id={slug(cat)} className="scroll-mt-32 pt-8">
            <h2 className="mb-3 font-display text-2xl font-bold">{cat}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

function ProductCard({ p }: { p: CatalogProduct }) {
  return (
    <article className={`flex gap-3 rounded-lg border border-border bg-card p-3 ${p.available ? '' : 'opacity-60'}`}>
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
        {p.image
          ? <img src={p.image} alt={p.name} loading="lazy" width={112} height={112} className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">Foto em breve</div>}
        {p.image && p.illustrative && <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px] text-muted-foreground">Imagem ilustrativa</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-bold leading-tight">{p.name}</h3>
        {p.description && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{p.description}</p>}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-lg font-bold text-primary">{brl(p.price)}</span>
          {!p.available && <span className="rounded bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">Esgotado</span>}
        </div>
      </div>
    </article>
  );
}
