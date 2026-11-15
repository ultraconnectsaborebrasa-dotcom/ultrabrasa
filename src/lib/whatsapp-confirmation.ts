export const ORDER_CONFIRMED_MESSAGE = 'Prontinho! Seu pedido foi confirmado!\n\nJá deixamos tudo organizado por aqui.\n\nNossos pedidos começam a sair a partir das 11:00.\n\nO prazo estimado de entrega é de 30 a 45 minutos após a saída do pedido para entrega.\n\nAgradecemos pela preferência e confiança. Será um prazer atender você!';

/** Only the atomic acceptance job owns the confirmation; Pix-key jobs are separate. */
export function isOrderConfirmationJob(key: string): boolean {
  return key.startsWith('accepted:') && !key.endsWith(':pix-key');
}

export function canSendOrderConfirmation(status?: string): boolean {
  return status === 'accepted';
}