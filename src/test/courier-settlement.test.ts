import { describe, expect, it } from 'vitest';
import { settlementForShift, settlementTotals, type CourierSettlementRow } from '@/lib/courier-settlement';
const row = (category: CourierSettlementRow['category'], amount: number): CourierSettlementRow => ({ order_id: category, number: 1, customer: 'Cliente', courier_id: 'courier', courier_name: 'Motoboy', status: 'Entregue', category, amount, method: '', paid_at: null });
describe('Acerto do entregador', () => {
  it('separa dinheiro da manhã e noite pelo ponto, não pelo horário da baixa', () => {
    const rows = [{ ...row('cash', 40), shift_id: 'morning', paid_at: 1800000000000 }, { ...row('cash', 25), shift_id: 'night' }];
    expect(settlementTotals(settlementForShift(rows, 'morning')).cash).toBe(40);
    expect(settlementTotals(settlementForShift(rows, 'night')).cash).toBe(25);
  });
  it('mantém pendência no turno encerrado sem transferir para a noite', () => {
    const rows = [{ ...row('pending', 19.9), shift_id: 'morning', shift_closed_at: '2026-11-25T17:00:00Z' }];
    expect(settlementTotals(settlementForShift(rows, 'morning')).pending).toBe(19.9);
    expect(settlementForShift(rows, 'night')).toHaveLength(0);
  });
  it('somente dinheiro recebido compõe o repasse', () => expect(settlementTotals([row('cash', 39.8), row('card', 19.9), row('prepaid', 59.7), row('pending', 19.9), row('store', 10), row('unverified', 19.9)]).cash).toBe(39.8));
  it('separa notas da maquininha dos pedidos já pagos', () => { const totals = settlementTotals([row('card', 39.8), row('prepaid', 19.9)]); expect(totals.card).toBe(39.8); expect(totals.prepaid).toBe(19.9); });
  it('não desconta cancelamento de dinheiro recebido sem estorno registrado', () => expect(settlementTotals([{ ...row('cash', 19.9), status: 'Cancelado' }]).cash).toBe(19.9));
});