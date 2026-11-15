export const ORDER_CONFIRMED_MESSAGE = 'Pedido confirmado! ❤️😊\n\nJá deixamos tudo organizado por aqui!\n\nA partir das 11h começaremos as montagens dos pedidos.\n\nNosso prazo estimado de entrega é de 30 a 45 minutos.\n\nAgradecemos pela preferência e confiança! Será um prazer atender você. 🙏❤️';

/** Only the atomic acceptance job owns the confirmation; Pix-key jobs are separate. */
export function isOrderConfirmationJob(key: string): boolean {
  return key.startsWith('accepted:') && !key.endsWith(':pix-key');
}

export function canSendOrderConfirmation(status?: string): boolean {
  return status === 'accepted';
}