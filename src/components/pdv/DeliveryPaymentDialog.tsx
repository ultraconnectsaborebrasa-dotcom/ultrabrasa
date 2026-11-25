import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { brl } from '@/lib/pdv-store';
import { saoPauloDay } from '@/lib/courier-operations';
import { deliveryReceivablesQuery, refreshDeliveryPayments, reportCustomerPaid, rejectCustomerPaid } from '@/lib/delivery-payment';
import { submitManualPayment } from '@/lib/manual-payment';

export function DeliveryPaymentDialog({ orderId, date = saoPauloDay(), courier = false, onClose, onPaid }: { orderId: string; date?: string; courier?: boolean; onClose: () => void; onPaid?: () => Promise<void> }) {
  const query = useQuery(deliveryReceivablesQuery(date));
  const client = useQueryClient();
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const order = query.data?.orders.find(item => item.id === orderId);
  const selectedMethod = method || (query.data?.methods.includes(order?.method ?? '') ? order?.method : '') || '';
  const awaitingStore = courier && Boolean(order?.customer_paid_reported_at);
  async function reject() {
    if (!order || courier || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await rejectCustomerPaid(order.id);
      toast.success('Pagamento não localizado. Pedido continua a receber.');
      await refreshDeliveryPayments(client);
      onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a conferência.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function report() {
    if (!order || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await reportCustomerPaid(order.id);
      toast.success('Aviso enviado. A loja vai conferir o pagamento.');
      await refreshDeliveryPayments(client);
      onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o aviso.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function confirm() {
    if (!order || !selectedMethod || lock.current || awaitingStore) return;
    lock.current = true; setBusy(true);
    try {
      await submitManualPayment(order.id, selectedMethod);
      toast.success(`Pagamento do pedido #${order.number} registrado no PDV.`);
      onClose();
      try {
        await refreshDeliveryPayments(client);
        await onPaid?.();
      } catch { toast.warning('Pagamento salvo. Atualize a tela para conferir o saldo.'); }
    } catch (error) { toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'Não foi possível registrar o pagamento.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md"><DialogHeader><DialogTitle>{order ? `Conferir recebimento · #${order.number}` : 'Conferir recebimento'}</DialogTitle></DialogHeader>
    {query.isPending && <p role="status">Carregando pedido…</p>}
    {query.error && <p role="alert" className="text-destructive">{query.error.message}</p>}
    {!query.isPending && !query.error && !order && <p role="status">Este pedido já foi pago ou não está disponível para recebimento nesta conta.</p>}
    {order && <><div><h3 className="break-words font-semibold">{order.customer || 'Cliente'}</h3><p className="text-sm text-muted-foreground">{order.status} · {order.courier_name || 'Sem entregador'}</p></div>
      <ul className="divide-y border-y">{order.items.map((item, index) => <li key={index} className="py-2 text-sm"><b>{item.qty}×</b> {item.name}{item.note && <p className="text-muted-foreground">{item.note}</p>}</li>)}</ul>
      {order.note && <p className="break-words text-sm text-warning">{order.note}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><span>Valor pendente</span><strong className="text-2xl text-primary">{brl(order.total)}</strong></div>
      {order.customer_paid_reported_at && <div role="status" className="border-l-4 border-warning bg-warning/10 p-3 text-sm"><b>Cliente informou que já pagou</b><p>{courier ? 'Aguardando Caixa ou Administrador conferir. Ainda não foi dada baixa.' : 'Confira o recebimento na loja antes de confirmar a baixa.'}</p></div>}
      {!awaitingStore && <label className="space-y-2 text-sm">Recebido em<select aria-label="Forma de pagamento recebida" className="field w-full" disabled={busy} value={selectedMethod} onChange={event => setMethod(event.target.value)}><option value="">Selecione</option>{query.data?.methods.map(item => <option key={item}>{item}</option>)}</select></label>}
      {courier && !awaitingStore && <Button variant="outline" className="h-auto min-h-12 whitespace-normal" disabled={busy} onClick={() => void report()}>Cliente informou que já pagou · solicitar conferência</Button>}
      {!courier && order.customer_paid_reported_at && <Button variant="outline" className="h-auto min-h-12 whitespace-normal" disabled={busy} onClick={() => void reject()}>Não localizei o pagamento · manter a receber</Button>}
      <p className="text-xs text-muted-foreground">{awaitingStore ? 'Sem baixa de pagamento até a conferência da loja.' : 'A baixa será registrada somente ao confirmar o recebimento.'} A entrega não será concluída.</p></>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Voltar</Button>{order && !awaitingStore && <Button className="h-auto min-h-12 whitespace-normal" disabled={busy || !selectedMethod} onClick={() => void confirm()}>{busy ? 'Salvando…' : 'Confirmar que recebi e dar baixa'}</Button>}</div>
  </DialogContent></Dialog>;
}