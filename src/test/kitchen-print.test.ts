import { beforeEach, describe, expect, it, vi } from 'vitest';

const { printOrder, rpc, toastError } = vi.hoisted(() => ({
  printOrder: vi.fn(),
  rpc: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/services/thermalPrinter', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/thermalPrinter')>(),
  printOrder,
}));
vi.mock('sonner', () => ({ toast: { error: toastError } }));

import { autoPrintKitchenOrderById, printableKitchenOrder } from '@/lib/kitchen-print';

const projection = {
  id: 'wa-order-1', number: 915, type: 'Delivery' as const, customer: 'Maria',
  customerPhone: '5573999999999', status: 'cozinha' as const, createdAt: 123,
  note: 'Sem salada', items: [{ name: 'Marmita completa', qty: 2, price: 19.9, note: 'Sem salada' }],
};

describe('impressão automática ao enviar à cozinha', () => {
  beforeEach(() => {
    localStorage.clear();
    printOrder.mockReset().mockResolvedValue(undefined);
    rpc.mockReset().mockResolvedValue({ data: { orders: [projection] }, error: null });
    toastError.mockReset();
  });

  it('busca a comanda aceita e envia à impressora da cozinha pela fila deduplicada', async () => {
    await expect(autoPrintKitchenOrderById('wa-order-1')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('read_pdv_cashier');
    expect(printOrder).toHaveBeenCalledTimes(1);
    const [order, fee, options] = printOrder.mock.calls[0]!;
    expect(order).toMatchObject({ id: 'wa-order-1', number: 915, customer: 'Maria', status: 'cozinha' });
    expect(order.items[0]).toMatchObject({ name: 'Marmita completa', qty: 2, price: 19.9, note: 'Sem salada' });
    expect(fee).toBe(0);
    expect(options).toEqual({ target: 'kitchen' });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('respeita a impressão automática desligada sem consultar ou imprimir', async () => {
    localStorage.setItem('ultrabrasa-printer-autoPrintEnabled', 'false');
    await expect(autoPrintKitchenOrderById('wa-order-1')).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(printOrder).not.toHaveBeenCalled();
  });

  it('não informa sucesso nem imprime outra comanda quando a aceita não aparece', async () => {
    await expect(autoPrintKitchenOrderById('outro-pedido')).resolves.toBe(false);
    expect(printOrder).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('não foi impressa'));
  });

  it('mantém os dados necessários da comanda na conversão', () => {
    expect(printableKitchenOrder(projection)).toMatchObject({
      id: 'wa-order-1', number: 915, type: 'Delivery', customerPhone: '5573999999999',
      items: [{ name: 'Marmita completa', qty: 2, price: 19.9, note: 'Sem salada' }],
    });
  });
});
