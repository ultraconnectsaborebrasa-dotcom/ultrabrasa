import { useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { marmitaSelectionError, type Courier, type Delivery } from '@/lib/delivery';

export function TransferDeliveryControl({ delivery, deliveries, couriers, busy, onTransfer }: {
  delivery: Delivery;
  deliveries: Delivery[];
  couriers: Courier[];
  busy: boolean;
  onTransfer: (deliveryId: string, courierId: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [courierId, setCourierId] = useState('');
  const [saving, setSaving] = useState(false);
  const candidates = couriers.filter(courier => courier.active && courier.id !== delivery.courier_id);
  const selectedError = courierId ? marmitaSelectionError(candidates.find(courier => courier.id === courierId), deliveries, [delivery]) : null;

  async function confirm() {
    if (!courierId || selectedError) return;
    setSaving(true);
    const saved = await onTransfer(delivery.id, courierId);
    setSaving(false);
    if (saved) { setOpen(false); setCourierId(''); }
  }

  return <>
    <Button size="sm" variant="outline" disabled={busy || !candidates.length} onClick={() => setOpen(true)}><ArrowLeftRight size={14} />Transferir</Button>
    {open && <div role="dialog" aria-modal="true" aria-label={`Transferir pedido ${delivery.number}`} className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4"><div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl">
      <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h3 className="text-lg font-bold">Transferir pedido #{delivery.number}</h3><p className="text-sm text-muted-foreground">{delivery.customer} · a reserva será liberada do motoboy atual e validada no novo.</p></div><Button size="icon" variant="ghost" aria-label="Fechar transferência" onClick={() => setOpen(false)}><X size={18} /></Button></div>
      <label className="mt-4 block text-sm font-medium">Novo entregador<select className="field mt-1" value={courierId} onChange={event => setCourierId(event.target.value)}><option value="">Selecione</option>{candidates.map(courier => { const error = marmitaSelectionError(courier, deliveries, [delivery]); return <option key={courier.id} value={courier.id} disabled={Boolean(error)}>{courier.name}{error ? ` · ${error}` : ` · ${courier.available_quantity ?? 0} disponível(is)`}</option>; })}</select></label>
      {selectedError && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{selectedError}</p>}
      <p className="mt-3 text-xs text-muted-foreground">A entrega não será marcada como concluída e o pagamento não será alterado.</p>
      <div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={saving || !courierId || Boolean(selectedError)} onClick={() => void confirm()}>{saving ? 'Transferindo…' : 'Confirmar transferência'}</Button></div>
    </div></div>}
  </>;
}
