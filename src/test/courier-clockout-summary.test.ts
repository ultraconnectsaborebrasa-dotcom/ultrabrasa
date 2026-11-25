import { describe, expect, it } from 'vitest';
import { clockOutSummary, type CourierSettlementRow } from '@/lib/courier-settlement';
const row = (number: number, category: CourierSettlementRow['category'], amount: number): CourierSettlementRow => ({ order_id: String(number), number, customer: 'C', courier_id: 'x', courier_name: 'X', status: 'Entregue', category, amount, method: '', paid_at: null });
describe('resumo de saída do entregador', () => {
  it('separa dinheiro, notas da maquininha e já pagos', () => {
    const text = clockOutSummary([row(1, 'cash', 20), row(2, 'cash', 19.9), row(3, 'card', 30), row(4, 'prepaid', 25), row(5, 'store', 10)]);
    expect(text).toContain('Dinheiro a repassar: R$\u00a039,90 (2 pedido(s))');
    expect(text).toContain('1 nota(s) somando R$\u00a030,00 — #3 R$\u00a030,00');
    expect(text).toContain('Já pagos pela loja: R$\u00a035,00 (2 pedido(s))');
  });
});
