import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emptyDelivery } from '../lib/delivery';
import type { Order } from '../lib/pdv-store';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { receiptOrderWithDelivery } from '../services/deliveryReceipt';
import { formatReceipt } from '../services/thermalPrinter';

const order = (patch: Partial<Order> = {}): Order => ({
  id: 'delivery-order', number: 7, type: 'Delivery', customer: 'Maria',
  createdAt: 1793016000000, status: 'cozinha', note: '', discount: 0, fee: 0,
  serviceFee: false, payments: [],
  items: [{ uid: '1', productId: 'p1', name: 'Espeto', qty: 2, price: 8, note: '' }], ...patch,
});
const delivery = { ...emptyDelivery(), address: { ...emptyDelivery().address,
  street: 'Rua das Palmeiras', number: '123', neighborhood: 'Centro',
  complement: 'Casa 2', postalCode: '45820-000', reference: 'Portao azul',
} };

describe('Delivery order receipt address', () => {
  beforeEach(() => rpc.mockReset());
  it('resolves only the matching order from the authorized delivery list', async () => {
    rpc.mockResolvedValue({ data: { deliveries: [
      { order_id: 'other', address: { ...delivery.address, street: 'Rua errada' } },
      { order_id: 'delivery-order', address: delivery.address, phone: '5573999998888', payment_method: 'Pix' },
    ] }, error: null });
    const resolved = await receiptOrderWithDelivery(order());
    expect(rpc).toHaveBeenCalledWith('read_delivery_board');
    expect(resolved.delivery?.address).toEqual(delivery.address);
    expect(resolved.customerPhone).toBe('5573999998888');
    const text = formatReceipt(resolved, 0);
    for (const value of ['Rua das Palmeiras', '123', 'Centro', 'Casa 2', 'Eunapolis', 'BA', '45820-000', 'Portao azul']) expect(text.replace(/\s+/g, ' ')).toContain(value);
    expect(text).not.toContain('Rua errada');
    expect(text.split('\n').every(line => line.length <= 28)).toBe(true);
  });
  it('looks up the address when the saved one is empty or type casing differs', async () => {
    rpc.mockResolvedValue({ data: { deliveries: [{ order_id: 'delivery-order', address: delivery.address, phone: '', payment_method: 'Pix' }] }, error: null });
    const resolved = await receiptOrderWithDelivery(order({ type: 'delivery' as Order['type'], delivery: { ...delivery, address: emptyDelivery().address } }));
    expect(formatReceipt(resolved, 0)).toContain('Rua das Palmeiras');
  });
  it('uses the saved address without querying again', async () => {
    const original = order({ delivery });
    expect(await receiptOrderWithDelivery(original)).toBe(original);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('leaves non-Delivery orders unchanged and excludes stale addresses', async () => {
    const original = order({ type: 'Balcão', delivery });
    expect(await receiptOrderWithDelivery(original)).toBe(original);
    expect(rpc).not.toHaveBeenCalled();
    expect(formatReceipt(original, 0)).not.toContain('Rua das Palmeiras');
  });
  it('blocks an incomplete Delivery print when the address cannot be read', async () => {
    rpc.mockResolvedValue({ data: { deliveries: [] }, error: null });
    await expect(receiptOrderWithDelivery(order())).rejects.toThrow('sem endereço');
    rpc.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(receiptOrderWithDelivery(order())).rejects.toThrow('carregar o endereço');
  });
});