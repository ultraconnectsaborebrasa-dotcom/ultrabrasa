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

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Resumo do repasse exibido ao entregador ao registrar a saída do turno. */
export function clockOutSummary(rows: CourierSettlementRow[]) {
  const totals = settlementTotals(rows);
  const count = (...categories: CourierSettlementRow['category'][]) => rows.filter(row => categories.includes(row.category)).length;
  const cardRows = rows.filter(row => row.category === 'card');
  const lines = [
    `💵 Dinheiro a repassar: ${money(totals.cash)} (${count('cash')} pedido(s))`,
    `💳 Notas da maquininha/Pix: ${cardRows.length} nota(s) somando ${money(totals.card)}${cardRows.length ? ` — ${cardRows.map(row => `#${row.number} ${money(Number(row.amount))}`).join(', ')}` : ''}`,
    `✅ Já pagos pela loja: ${money(Math.round((totals.prepaid + totals.store) * 100) / 100)} (${count('prepaid', 'store')} pedido(s))`,
  ];
  if (totals.pending > 0) lines.push(`⏳ Ainda a receber: ${money(totals.pending)} (${count('pending')} pedido(s))`);
  return lines.join('\n');
}
