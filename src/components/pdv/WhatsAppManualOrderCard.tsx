import { ClipboardList, MapPin, ShoppingBag, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WhatsAppManualOrder } from '@/lib/whatsapp-manual-order';

function DataField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? 'col-span-2' : ''}>
    <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className={`mt-0.5 break-words text-xs font-medium ${value ? 'text-foreground' : 'text-muted-foreground'}`}>{value || 'A completar'}</dd>
  </div>;
}

export function WhatsAppManualOrderCard({ order, onBuildOrder }: { order: WhatsAppManualOrder; onBuildOrder: (order: WhatsAppManualOrder) => void }) {
  const address = order.delivery?.address;
  return <section aria-label="Dados para montar o pedido" className="rounded-xl border border-primary/30 bg-primary/5 p-3 shadow-sm">
    <div className="flex items-start gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ClipboardList size={17} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold">Dados para montar o pedido</h3>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">Reconhecidos nas mensagens do cliente. Revise e complete antes de salvar.</p>
      </div>
    </div>

    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border bg-card p-2.5">
      <DataField label="Nome" value={order.customer} />
      <DataField label="WhatsApp" value={`+${order.phone}`} />
      <DataField label="Rua" value={address?.street ?? ''} wide />
      <DataField label="Número" value={address?.number ?? ''} />
      <DataField label="Bairro" value={address?.neighborhood ?? ''} />
      <DataField label="Referência" value={address?.reference ?? ''} wide />
      {address?.complement && <DataField label="Complemento" value={address.complement} wide />}
      <DataField label="Pagamento" value={order.paymentLabel === 'Cartão' ? 'Cartão — confirmar crédito ou débito' : order.paymentLabel} wide />
    </dl>

    {(!address?.street || !address.number || !address.neighborhood) && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-warning"><MapPin className="mt-0.5 shrink-0" size={13} /> Confira a conversa e complete os dados de entrega que faltarem.</p>}
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button size="sm" className="w-full sm:w-auto" onClick={() => onBuildOrder(order)}><ShoppingBag /> Preencher pedido</Button>
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><UserRound size={12} /> Você revisa tudo antes de enviar.</span>
    </div>
  </section>;
}
