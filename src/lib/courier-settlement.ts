export type CourierSettlementRow = {
  order_id: string; number: number; customer: string; courier_id: string; courier_name: string;
  status: string; category: 'cash' | 'card' | 'prepaid' | 'store' | 'pending' | 'unverified';
  amount: number; method: string; paid_at: number | null;
};

export function settlementTotals(rows: CourierSettlementRow[]) {
  const sum = (category: CourierSettlementRow['category']) => Math.round(rows.filter(row => row.category === category).reduce((total, row) => total + Number(row.amount), 0) * 100) / 100;
  return { cash: sum('cash'), card: sum('card'), prepaid: sum('prepaid'), store: sum('store'), pending: sum('pending'), unverified: sum('unverified') };
}

export const SETTLEMENT_LABELS = {
  cash: 'Dinheiro a repassar', card: 'Recebido na maquininha', prepaid: 'Pago antes da saída',
  store: 'Pago na loja / origem não identificada', pending: 'Ainda a receber', unverified: 'Comprovante não confirmado',
};