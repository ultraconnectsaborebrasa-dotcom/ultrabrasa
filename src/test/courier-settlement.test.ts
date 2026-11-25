import { describe, expect, it } from 'vitest';
import { settlementTotals, type CourierSettlementRow } from '@/lib/courier-settlement';
const row = (category: CourierSettlementRow['category'], amount: number): CourierSettlementRow => ({ order_id: category, number: 1, customer: 'Cliente', courier_id: 'courier', courier_name: 'Motoboy', status: 'Entregue', category, amount, method: '', paid_at: null });
describe('Acerto do entregador', () => {
  it('somente dinheiro recebido compõe o repasse', () => expect(settlementTotals([row('cash', 39.8), row('card', 19.9), row('prepaid', 59.7), row('pending', 19.9), row('store', 10), row('unverified', 19.9)]).cash).toBe(39.8));
  it('separa notas da maquininha dos pedidos já pagos', () => { const totals = settlementTotals([row('card', 39.8), row('prepaid', 19.9)]); expect(totals.card).toBe(39.8); expect(totals.prepaid).toBe(19.9); });
  it('não desconta cancelamento de dinheiro recebido sem estorno registrado', () => expect(settlementTotals([{ ...row('cash', 19.9), status: 'Cancelado' }]).cash).toBe(19.9));
});