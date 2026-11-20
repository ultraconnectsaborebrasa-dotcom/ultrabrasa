import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/pdv-store';

const { printOrder, rpc, toastError, toastInfo, toastSuccess } = vi.hoisted(() => ({
  printOrder: vi.fn(), rpc: vi.fn(), toastError: vi.fn(), toastInfo: vi.fn(), toastSuccess: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/services/thermalPrinter', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/thermalPrinter')>(), printOrder,
}));
vi.mock('sonner', () => ({ toast: { error: toastError, info: toastInfo, success: toastSuccess } }));

import { autoPrintPaidPixOrderById, autoPrintPaidPixReceipt, isPixPaymentMethod } from '@/lib/pix-payment-print';

const projection = {
  id: 'order-1', number: 1001, type: 'Delivery' as const, customer: 'Maria', status: 'pronto' as const,
  createdAt: 123, note: '', total: 19.9,
  items: [{ name: 'Marmita completa', qty: 1, price: 19.9, note: '' }],
};
const paidOrder: Order = {
  id: 'order-1', number: 1001, type: 'Balcão', customer: 'Maria', status: 'pago', createdAt: 123,
  note: '', discount: 0, fee: 0, serviceFee: false, paymentStatus: 'pago', paidAt: 456,
  items: [{ uid: 'item-1', productId: 'marmita', name: 'Marmita completa', qty: 1, price: 19.9, note: '' }],
  payments: [{ method: 'Pix', amount: 19.9 }],
};

describe('cupom automático de pagamento Pix', () => {
  beforeEach(() => {
    printOrder.mockReset().mockResolvedValue(undefined);
    rpc.mockReset().mockResolvedValue({ data: { orders: [projection] }, error: null });
    toastError.mockReset(); toastInfo.mockReset(); toastSuccess.mockReset();
  });

  it('reconhece Pix sem depender de maiúsculas ou espaços', () => {
    expect(isPixPaymentMethod(' PIX ')).toBe(true);
    expect(isPixPaymentMethod('Dinheiro')).toBe(false);
  });

  it('imprime o pedido pago com o valor Pix registrado no banco', async () => {
    await expect(autoPrintPaidPixOrderById('order-1', 'Pix')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('read_pdv_cashier');
    const [order, fee, options] = printOrder.mock.calls[0]!;
    expect(order).toMatchObject({ id: 'order-1', status: 'pronto', paymentStatus: 'pago', payments: [{ method: 'Pix', amount: 19.9 }] });
    expect(fee).toBe(0);
    expect(options).toEqual({ manual: true, force: true, target: 'cashier' });
  });

  it('não consulta nem imprime baixa de outro método', async () => {
    await expect(autoPrintPaidPixOrderById('order-1', 'Dinheiro')).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(printOrder).not.toHaveBeenCalled();
  });

  it('imprime diretamente uma venda local paga no Pix', async () => {
    await expect(autoPrintPaidPixReceipt(paidOrder)).resolves.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(printOrder).toHaveBeenCalledTimes(1);
  });

  it('não trata pedido apenas destinado ao Pix como pagamento confirmado', async () => {
    await expect(autoPrintPaidPixReceipt({ ...paidOrder, status: 'pronto', paymentStatus: 'pendente', paidAt: undefined })).resolves.toBe(false);
    expect(printOrder).not.toHaveBeenCalled();
  });

  it('mantém a baixa concluída quando a impressora falha', async () => {
    printOrder.mockRejectedValue(new Error('QZ Tray desconectado'));
    await expect(autoPrintPaidPixOrderById('order-1', 'Pix')).resolves.toBe(false);
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('pago no Pix'));
  });
});
