import { describe, expect, it } from 'vitest';
import { isStoreToday, storeDayStart, pendingPayment } from '../lib/daily-inbox';
describe('Organização diária de Eunápolis', () => {
  const now = Date.parse('2026-11-08T02:50:00Z');
  it('usa 7 de novembro às 23h50 local, não o dia seguinte UTC', () => {
    expect(storeDayStart(now)).toBe('2026-11-07T00:00:00-03:00');
    expect(isStoreToday('2026-11-07T03:00:00Z', now)).toBe(true);
    expect(isStoreToday('2026-11-07T02:59:59Z', now)).toBe(false);
  });
  it('muda o dia à meia-noite local', () => {
    expect(isStoreToday('2026-11-08T02:59:59Z', Date.parse('2026-11-08T03:00:00Z'))).toBe(false);
  });
  it('mantém pedido entregue sem pagamento disponível para baixa manual', () => {
    expect(pendingPayment({status:'entregue',total:19.9})).toBe(true);
  });
  it('exclui quitados e cancelados da fila de baixa', () => {
    expect(pendingPayment({status:'cozinha',paymentStatus:'pago',total:19.9})).toBe(false);
    expect(pendingPayment({status:'cancelado',total:19.9})).toBe(false);
  });
});