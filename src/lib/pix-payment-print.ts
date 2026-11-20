import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Order } from '@/lib/pdv-store';
import { printableKitchenOrder } from '@/lib/kitchen-print';
import { printOrder } from '@/services/thermalPrinter';

export function isPixPaymentMethod(method: unknown): boolean {
  return String(method ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'pix';
}

function isPaidOrder(order: Order): boolean {
  return order.status === 'pago' || order.paymentStatus === 'pago' || Boolean(order.paidAt);
}

export async function autoPrintPaidPixReceipt(order: Order, serviceFeePct = 0): Promise<boolean> {
  if (!isPaidOrder(order) || !order.payments.some(payment => isPixPaymentMethod(payment.method))) return false;
  try {
    toast.info(`Imprimindo cupom pago no Pix do pedido #${order.number}...`);
    await printOrder(order, serviceFeePct, { manual: true, force: true, target: 'cashier' });
    toast.success(`Cupom pago no Pix do pedido #${order.number} impresso`);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'verifique o QZ Tray e a impressora selecionada';
    toast.error(`Pedido #${order.number} pago no Pix, mas o cupom não foi impresso: ${detail}`);
    return false;
  }
}

type CashierOrderProjection = Parameters<typeof printableKitchenOrder>[0] & { total?: number; paidAt?: number };

// A baixa já foi persistida quando esta função é chamada. A impressão usa uma nova
// leitura autorizada e nunca desfaz o pagamento se a impressora falhar.
export async function autoPrintPaidPixOrderById(orderId: string, paymentMethod: string): Promise<boolean> {
  if (!isPixPaymentMethod(paymentMethod)) return false;
  try {
    const { data, error } = await supabase.rpc('read_pdv_cashier' as never);
    if (error) throw new Error(error.message);
    const orders = (data as unknown as { orders?: CashierOrderProjection[] } | null)?.orders ?? [];
    const found = orders.find(order => order.id === orderId);
    if (!found) throw new Error('pedido pago não encontrado para emitir o cupom');
    const order = printableKitchenOrder(found);
    const itemsTotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const storedTotal = Number(found.total);
    const amount = Number.isFinite(storedTotal) ? storedTotal : itemsTotal;
    return autoPrintPaidPixReceipt({
      ...order,
      paymentStatus: 'pago',
      paidAt: found.paidAt ?? Date.now(),
      payments: [{ method: 'Pix', amount }],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'não foi possível carregar o pedido pago';
    toast.error(`Pagamento Pix confirmado, mas o cupom não foi impresso: ${detail}`);
    return false;
  }
}
