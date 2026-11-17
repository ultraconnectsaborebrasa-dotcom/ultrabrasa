import { useRef, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { brl } from '@/lib/pdv-store';

export function ReceiveAndSendDialog({
  total,
  methods,
  busy,
  onClose,
  onConfirm,
}: {
  total: number;
  methods: string[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (method: string) => Promise<void>;
}) {
  const [method, setMethod] = useState('');
  const lock = useRef(false);

  async function confirm() {
    if (lock.current || busy || !method) return;
    lock.current = true;
    try {
      await onConfirm(method);
    } finally {
      lock.current = false;
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receber e enviar à cozinha</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between border-y py-4">
          <span>Valor a receber</span>
          <strong className="text-2xl text-primary">{brl(total)}</strong>
        </div>
        <label className="space-y-2 text-sm">
          Forma de pagamento
          <select
            aria-label="Forma de pagamento do novo pedido"
            className="field w-full"
            value={method}
            disabled={busy}
            onChange={event => setMethod(event.target.value)}
          >
            <option value="">Selecione</option>
            {methods.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <p className="text-sm text-muted-foreground">
          O pagamento e o pedido serão gravados juntos. Depois, a comanda da cozinha será impressa automaticamente.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={busy} onClick={onClose}>Voltar</Button>
          <Button disabled={busy || !method} onClick={() => void confirm()}>
            <CreditCard className="mr-2 h-4 w-4" />
            {busy ? 'Recebendo…' : 'Receber, imprimir e enviar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
