import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WhatsAppManualOrder } from '@/lib/whatsapp-manual-order';

/** Pedido manual: abre o PDV em branco, só com o telefone da conversa. Nada é preenchido automaticamente. */
export function blankManualOrder(phone: string): WhatsAppManualOrder {
  return { phone, customer: '', type: null, delivery: undefined, paymentLabel: '' };
}

export function WhatsAppManualOrderCard({ phone, onBuildOrder }: { phone: string; onBuildOrder: (order: WhatsAppManualOrder) => void }) {
  return <section aria-label="Montar pedido manual" className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
    <div className="min-w-0 flex-1">
      <h3 className="text-sm font-bold">Pedido manual</h3>
      <p className="text-[11px] text-muted-foreground">Abre em branco, com a conversa ao lado para copiar os dados.</p>
    </div>
    <Button size="sm" className="shrink-0" onClick={() => onBuildOrder(blankManualOrder(phone))}><ShoppingBag /> Montar pedido</Button>
  </section>;
}
