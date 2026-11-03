import { describe, expect, it } from 'vitest';
import { orderAlertFromRequest, shouldRepeatOrderSound, pruneAcked, newReceipts } from '@/lib/whatsapp-alerts';

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
  it('repete o som somente após o intervalo configurado e enquanto houver pedido não reconhecido', () => {
    expect(shouldRepeatOrderSound(31_000, 0, 30, 1)).toBe(true);
    expect(shouldRepeatOrderSound(29_000, 0, 30, 1)).toBe(false);
    expect(shouldRepeatOrderSound(60_000, 0, 30, 0)).toBe(false);
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
