import { toast } from 'sonner';
import type { Order } from '@/lib/pdv-store';
import { printOrder } from '@/services/thermalPrinter';

export function isPixPaymentMethod(method: unknown): boolean {
  return String(method ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'pix';
}

function isPaidOrder(order: Order): boolean {
  return order.status === 'pago' || order.paymentStatus === 'pago' || Boolean(order.paidAt);
}

// Exclusivo para o recebimento durante a montagem da venda. Baixas posteriores
// na aba Receber e na conferência de comprovantes nunca chamam esta função.
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
