type RequestWithPayment = {
  payment?: unknown;
  note?: unknown;
  delivery?: { paymentMethod?: unknown } | null;
};

/** Lê a forma confirmada mesmo em pedidos antigos ou já editados. */
export function requestPaymentMethod(request: unknown): string {
  const r = request && typeof request === 'object' ? request as RequestWithPayment : {};
  const candidates = [r.delivery?.paymentMethod, r.payment];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const note = typeof r.note === 'string' ? r.note : '';
  return ['Pix', 'Dinheiro', 'Cartão', 'Crédito', 'Débito']
    .find(method => note.includes(`Pagamento: ${method}`)) ?? '';
}

export function pixPaymentMessage(pixKey: string): string {
  return `Para realizar o pagamento, segue nossa chave PIX:\n\nChave PIX telefone ${pixKey}\n\nApós o pagamento, se possível, envie o comprovante por aqui para confirmarmos. ✅\n\nAgradecemos pela preferência!\n\nUltraConnect🔥`;
}
