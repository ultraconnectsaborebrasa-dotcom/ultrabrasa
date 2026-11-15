import { useState } from 'react';
import { Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/lib/confirm-action';
import { runKitchenBulkAction } from '@/lib/kitchen-bulk';

export function BulkDeliveryDeparture({ count, disabled, onSaved }: { count: number; disabled?: boolean; onSaved: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  async function depart() {
    if (busy || !count || !await confirmAction(`Enviar todos os ${count} pedidos Delivery prontos para entrega? Eles sairão da cozinha e ficarão Em entrega. Pagamentos não mudam e a confirmação de entregue continua manual.`)) return;
    setBusy(true);
    try {
      const changed = await runKitchenBulkAction('depart');
      await onSaved();
      if (changed) toast.success(`${changed} pedido(s) enviados para entrega de uma vez`);
      else toast.info('Nenhum Delivery pronto aguardando saída.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar os pedidos para entrega');
    } finally { setBusy(false); }
  }
  return <Button variant="outline" disabled={disabled || busy || !count} onClick={() => void depart()}><Truck />{busy ? 'Enviando…' : `Enviar todos para entrega (${count})`}</Button>;
}