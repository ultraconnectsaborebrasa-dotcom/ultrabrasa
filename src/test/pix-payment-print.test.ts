import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/pdv-store';

const { printOrder, toastError, toastInfo, toastSuccess } = vi.hoisted(() => ({
  printOrder: vi.fn(), toastError: vi.fn(), toastInfo: vi.fn(), toastSuccess: vi.fn(),
}));
vi.mock('@/services/thermalPrinter', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/thermalPrinter')>(), printOrder,
}));
vi.mock('sonner', () => ({ toast: { error: toastError, info: toastInfo, success: toastSuccess } }));

import { autoPrintPaidPixReceipt, isPixPaymentMethod } from '@/lib/pix-payment-print';

const paidOrder: Order = {
  id: 'order-1', number: 1001, type: 'Balcão', customer: 'Maria', status: 'pago', createdAt: 123,
  note: '', discount: 0, fee: 0, serviceFee: false, paymentStatus: 'pago', paidAt: 456,
  items: [{ uid: 'item-1', productId: 'marmita', name: 'Marmita completa', qty: 1, price: 19.9, note: '' }],
  payments: [{ method: 'Pix', amount: 19.9 }],
};

describe('cupom automático ao receber durante a montagem', () => {
  beforeEach(() => {
    printOrder.mockReset().mockResolvedValue(undefined);
    toastError.mockReset(); toastInfo.mockReset(); toastSuccess.mockReset();
  });

  it('reconhece Pix sem depender de maiúsculas ou espaços', () => {
    expect(isPixPaymentMethod(' PIX ')).toBe(true);
    expect(isPixPaymentMethod('Dinheiro')).toBe(false);
  });

  it('imprime uma venda local paga no Pix durante a montagem', async () => {
    await expect(autoPrintPaidPixReceipt(paidOrder)).resolves.toBe(true);
    expect(printOrder).toHaveBeenCalledWith(paidOrder, 0, { manual: true, force: true, target: 'cashier' });
  });

  it('não trata pedido apenas destinado ao Pix como pagamento confirmado', async () => {
    await expect(autoPrintPaidPixReceipt({ ...paidOrder, status: 'pronto', paymentStatus: 'pendente', paidAt: undefined })).resolves.toBe(false);
    expect(printOrder).not.toHaveBeenCalled();
  });

  it('mantém a venda concluída quando a impressora falha', async () => {
    printOrder.mockRejectedValue(new Error('QZ Tray desconectado'));
    await expect(autoPrintPaidPixReceipt(paidOrder)).resolves.toBe(false);
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('pago no Pix'));
  });
});
