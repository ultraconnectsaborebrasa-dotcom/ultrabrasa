import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Cancelamento com motivo em janela própria (window.prompt não funciona no app de computador). */
export function CancelOrderButton({ orderId, number, hadPayment, onDone, size = 'sm' }: { orderId: string; number: number; hadPayment?: boolean; onDone?: () => void; size?: 'sm' | 'default' }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (reason.trim().length < 3) { toast.error('Informe o motivo do cancelamento.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('close_pdv_order', { _id: orderId, _reason: reason.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Pedido #${number} cancelado`);
    if (hadPayment) toast.warning('Este pedido tinha pagamento informado — verifique eventual devolução.');
    setOpen(false); setReason(''); onDone?.();
  }
  return <>
    <Button variant="destructive" size={size} onClick={() => setOpen(true)}>Cancelar</Button>
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar pedido #{number}?</DialogTitle>
          <DialogDescription>O estoque volta para os produtos. Cancelar não estorna pagamentos.</DialogDescription>
        </DialogHeader>
        <input autoFocus className="field w-full" maxLength={200} placeholder="Motivo do cancelamento" value={reason} onChange={e => setReason(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void confirm(); }} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Voltar</Button>
          <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => void confirm()}>{busy ? 'Cancelando…' : 'Confirmar cancelamento'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
