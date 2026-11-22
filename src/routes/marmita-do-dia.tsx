import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Check, ChefHat, Clock, Flame, MapPin, ShoppingBag, Truck } from 'lucide-react';
import { CatalogCheckout } from '@/components/catalog/CatalogCheckout';
import { Brand } from '@/components/pdv/Brand';
import { Button } from '@/components/ui/button';
import { getPublicCatalog } from '@/lib/catalog.functions';
import { catalogScheduleAvailable, dailyOfferHasLowStock, dailyOfferState, type CartLine } from '@/lib/catalog';
import { brl } from '@/lib/pdv-store';

const dailyQuery = queryOptions({
  queryKey: ['public-catalog'], queryFn: () => getPublicCatalog(), staleTime: 15_000, refetchInterval: 15_000,
});

export const Route = createFileRoute('/marmita-do-dia')({
  head: () => ({
    meta: [
      { title: 'Marmita do Dia — Ultraconnect Sabor e Brasa' },
      { name: 'description', content: 'Cardápio de hoje com churrasco, carne assada e linguiça de frango por R$ 19,90. Entrega grátis em Eunápolis.' },
      { property: 'og:title', content: 'Marmita do Dia — Ultraconnect Sabor e Brasa' },
      { property: 'og:description', content: 'Peça sua marmita do dia pelo cardápio público. Entrega grátis em Eunápolis e pagamento confirmado pela loja.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dailyQuery),
  component: DailyMenuPage,
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-center text-foreground">{error instanceof Error ? error.message : 'Não foi possível carregar a oferta'}</div>,
});

const BUTTON_LABEL = {
  available: 'Pedir minha marmita', inactive: 'Oferta indisponível no momento', 'sold-out': 'Esgotado por hoje',
  unavailable: 'Indisponível no momento', closed: 'Indisponível neste horário',
} as const;

function DailyMenuPage() {
  const { data } = useSuspenseQuery(dailyQuery);
  const offer = data.dailyOffer;
  const [now, setNow] = useState<Date | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { const update = () => setNow(new Date()); update(); const timer = setInterval(update, 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (data.stockExhausted) setOpen(false); }, [data.stockExhausted]);

  if (!offer) return <main className="grid min-h-screen place-items-center bg-background p-6 text-center"><div><Brand /><h1 className="mt-4 text-2xl font-bold">Oferta não configurada</h1><p className="mt-2 text-muted-foreground">A loja ainda não publicou a marmita do dia.</p></div></main>;

  const scheduled = now !== null && catalogScheduleAvailable('Marmitas', data.settings, now);
  const state = dailyOfferState(offer, scheduled, data.stockExhausted);
  const lowStock = !data.stockExhausted && dailyOfferHasLowStock(offer);
  const order = () => {
    if (state !== 'available') return;
    setCart([{ productId: offer.productId, name: offer.name, price: offer.price, qty: 1, note: '' }]);
    setOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Brand />
          <div><p className="font-display font-bold leading-tight">Ultraconnect Sabor e Brasa</p><p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />Eunápolis · BA</p></div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pb-32 pt-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary"><Flame className="h-4 w-4" />Marmita do dia</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-4 w-4" />09:00 às 14:00</span>
        </div>

        {offer.image && <div className="relative mb-5 aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted shadow-glow">
          <img src={offer.image} alt="Marmita do dia com carnes e acompanhamentos" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-background/90 px-4 py-3 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Hoje na Ultraconnect</p>
            <p className="font-display text-lg font-bold">Comida caseira com sabor de brasa</p>
          </div>
        </div>}

        <section aria-labelledby="daily-title">
          <h1 id="daily-title" className="font-display text-4xl font-extrabold leading-tight">{offer.title}</h1>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{offer.description}</p>
        </section>

        <section className="mt-5 rounded-xl border border-border bg-card p-4" aria-labelledby="sides-title">
          <h2 id="sides-title" className="flex items-center gap-2 font-display text-lg font-bold"><ChefHat className="h-5 w-5 text-primary" />Acompanha</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {offer.accompaniments.map((item) => <li key={item} className="flex items-center gap-2 text-sm"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/15 text-success"><Check className="h-3 w-3" /></span>{item}</li>)}
          </ul>
        </section>

        <section className="mt-5 flex items-end justify-between gap-4 rounded-xl border border-primary/40 bg-primary/10 p-4">
          <div><p className="text-sm font-semibold text-muted-foreground">Promoção de hoje</p><p className="font-display text-4xl font-extrabold text-primary">{brl(offer.price)}</p><p className="text-xs text-muted-foreground">cada marmita</p></div>
          <div className="text-right text-xs text-muted-foreground">Pagamento na entrega<br />ou retirada</div>
        </section>

        {data.settings?.freeDeliveryEunapolis && <div className="mt-4 flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-4 text-success"><Truck className="h-6 w-6 shrink-0" /><div><p className="font-bold">Entrega grátis para todo Eunápolis</p><p className="text-sm">Você também pode escolher retirada.</p></div></div>}
        {data.stockExhausted && <p role="status" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-center font-bold text-destructive">Cardápio indisponível no momento. Não estamos recebendo novos pedidos.</p>}
        {lowStock && <p role="status" className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-center text-sm font-bold text-warning">Poucas unidades disponíveis hoje.</p>}
        {state === 'sold-out' && <p role="status" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-center font-bold text-destructive">Esgotado por hoje</p>}
        {state === 'closed' && <p className="mt-4 text-center text-sm text-muted-foreground">Pedidos da marmita disponíveis das 09:00 às 14:00.</p>}

        <div className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShoppingBag className="mt-0.5 h-4 w-4 shrink-0" /><p>Seu pedido entra direto no sistema da loja. A equipe confirma o pedido e o pagamento pelo WhatsApp.</p></div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-4 backdrop-blur">
        <Button className="mx-auto flex h-14 w-full max-w-xl text-lg font-extrabold shadow-glow" disabled={state !== 'available'} onClick={order}>{BUTTON_LABEL[state]}</Button>
      </div>
      <CatalogCheckout cart={cart} setCart={setCart} open={open} setOpen={setOpen} channel="daily-menu" orderingDisabled={data.stockExhausted} />
    </div>
  );
}
