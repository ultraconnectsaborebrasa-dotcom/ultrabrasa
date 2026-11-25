import { describe, expect, it } from 'vitest';
import { orderAlertFromRequest, newOrderRequests, shouldPlayReminderSound, pruneAcked, newReceipts } from '@/lib/whatsapp-alerts';

const row = { id: 'r1', phone: '5573999999999', created_at: '2026-11-03T12:00:00Z', quoted_total: 45.8, public_code: 'C1005', order_number: null, request: { type: 'Delivery', items: [{ productId: 'p1', qty: 2, note: 'sem cebola' }, { productId: 'p2', qty: 1 }], delivery: { paymentMethod: 'Pix' } } };

describe('Alerta de pedido confirmado', () => {
  it('monta o aviso com código, itens, total, entrega e pagamento', () => {
    const a = orderAlertFromRequest(row, 'Camile');
    expect(a).toMatchObject({ id: 'r1', code: 'C1005', name: 'Camile', total: 45.8, type: 'Delivery', payment: 'Pix' });
    expect(a.items).toEqual([{ qty: 2, productId: 'p1', note: 'sem cebola' }, { qty: 1, productId: 'p2', note: undefined }]);
  });
  it('usa o número da comanda quando não há código do catálogo e tolera pedido sem itens', () => {
    const a = orderAlertFromRequest({ ...row, public_code: null, order_number: 371, request: {} }, null);
    expect(a.code).toBe('#371');
    expect(a.items).toEqual([]);
    expect(a.payment).toBeNull();
  });
  it('avisa cada pedido somente uma vez mesmo após aceite de outro ou atualização da fila', () => {
    const seen=new Set(['r1']);
    expect(newOrderRequests(seen,[row])).toEqual([]);
    const next={...row,id:'r2'};
    expect(newOrderRequests(seen,[next]).map(r=>r.id)).toEqual(['r2']);
    seen.add('r2');
    expect(newOrderRequests(seen,[next])).toEqual([]);
  });
  it('limita lembretes acumulados a um toque a cada oito segundos', () => {
    expect(shouldPlayReminderSound(10_000, 0)).toBe(true);
    expect(shouldPlayReminderSound(17_999, 10_000)).toBe(false);
    expect(shouldPlayReminderSound(18_000, 10_000)).toBe(true);
  });
  it('esquece reconhecimentos de pedidos que saíram da fila', () => {
    expect([...pruneAcked(new Set(['a', 'b', 'c']), new Set(['b']))]).toEqual(['b']);
  });
  it('detecta somente comprovantes ainda não vistos', () => {
    const seen = new Set(['x']);
    expect(newReceipts(seen, [{ id: 'x' }, { id: 'y' }]).map(r => r.id)).toEqual(['y']);
    expect(newReceipts(new Set(['x', 'y']), [{ id: 'x' }, { id: 'y' }])).toEqual([]);
  });
});
