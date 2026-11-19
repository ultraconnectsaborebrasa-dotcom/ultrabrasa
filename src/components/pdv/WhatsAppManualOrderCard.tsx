import { useState } from 'react';
import { Check, ChevronDown, ClipboardList, Copy, CreditCard, MapPin, ShoppingBag, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { WhatsAppManualOrder } from '@/lib/whatsapp-manual-order';

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  const copy = () => {
    if (!value) return;
    void navigator.clipboard?.writeText(value).then(() => toast.success(`${label} copiado`)).catch(() => toast.error('Não foi possível copiar'));
  };
  return <div className={`group flex items-start gap-2 rounded-lg border px-2.5 py-2 ${wide ? 'col-span-2' : ''} ${value ? 'bg-card' : 'border-dashed border-warning/50 bg-warning/5'}`}>
    <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${value ? 'bg-success text-card' : 'border border-warning/60'}`}>{value && <Check size={10} strokeWidth={3} />}</span>
    <div className="min-w-0 flex-1">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`break-words text-sm font-medium ${value ? 'text-foreground' : 'text-warning'}`}>{value || 'Falta perguntar'}</dd>
    </div>
    {value && <button type="button" onClick={copy} aria-label={`Copiar ${label}`} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Copy size={13} /></button>}
  </div>;
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div>
    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{icon}{title}</p>
    <dl className="grid grid-cols-2 gap-1.5">{children}</dl>
  </div>;
}

export function WhatsAppManualOrderCard({ order, onBuildOrder }: { order: WhatsAppManualOrder; onBuildOrder: (order: WhatsAppManualOrder) => void }) {
  const [open, setOpen] = useState(true);
  const address = order.delivery?.address;
  const payment = order.paymentLabel === 'Cartão' ? 'Cartão — confirmar crédito ou débito' : order.paymentLabel;
  const checks = [order.customer, address?.street, address?.number, address?.neighborhood, order.paymentLabel];
  const done = checks.filter(Boolean).length;
  const missing = [!order.customer && 'nome', !address?.street && 'rua', !address?.number && 'número', !address?.neighborhood && 'bairro', !order.paymentLabel && 'pagamento'].filter(Boolean) as string[];
  const pct = Math.round((done / checks.length) * 100);

  return <section aria-label="Montar pedido" className="overflow-hidden rounded-xl border border-primary/30 bg-primary/5 shadow-sm">
    <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2.5 p-3 text-left">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><ClipboardList size={18} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold">Montar pedido</h3>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all ${missing.length ? 'bg-warning' : 'bg-success'}`} style={{ width: `${pct}%` }} /></div>
          <span className="text-[11px] font-semibold text-muted-foreground">{done}/{checks.length}</span>
        </div>
      </div>
      <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>

    {open && <div className="space-y-3 px-3 pb-3">
      <ol className="flex items-center gap-1 text-[11px] font-semibold">
        {['Conferir dados', 'Escolher produtos', 'Enviar'].map((s, i) => <li key={s} className="flex flex-1 items-center gap-1">
          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
          <span className={i === 0 ? 'text-foreground' : 'text-muted-foreground'}>{s}</span>
        </li>)}
      </ol>

      <Section icon={<UserRound size={12} />} title="Cliente">
        <Field label="Nome" value={order.customer} />
        <Field label="WhatsApp" value={`+${order.phone}`} />
      </Section>
      <Section icon={<MapPin size={12} />} title="Entrega">
        <Field label="Rua" value={address?.street ?? ''} wide />
        <Field label="Número" value={address?.number ?? ''} />
        <Field label="Bairro" value={address?.neighborhood ?? ''} />
        <Field label="Referência" value={address?.reference ?? ''} wide />
        {address?.complement && <Field label="Complemento" value={address.complement} wide />}
      </Section>
      <Section icon={<CreditCard size={12} />} title="Pagamento">
        <Field label="Forma" value={payment} wide />
      </Section>

      {missing.length > 0
        ? <p className="rounded-lg bg-warning/10 px-2.5 py-2 text-xs text-warning">Falta: <b>{missing.join(', ')}</b>. Pergunte ao cliente ou complete na próxima tela.</p>
        : <p className="rounded-lg bg-success/10 px-2.5 py-2 text-xs text-success">Tudo certo! Agora é só escolher os produtos.</p>}

      <Button className="h-11 w-full text-sm font-bold" onClick={() => onBuildOrder(order)}><ShoppingBag /> Próximo: escolher produtos</Button>
      <p className="text-center text-[10px] text-muted-foreground">Nada é enviado sem você revisar.</p>
    </div>}
  </section>;
}
