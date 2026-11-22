import { botWindow } from './whatsapp-rulebot';

export const ORDER_CONFIRMED_MESSAGE = 'Prontinho! Seu pedido foi confirmado!\n\nJá deixamos tudo organizado por aqui.\n\nNossos pedidos começam a sair a partir das 11:00.\n\nO prazo estimado de entrega é de 30 a 45 minutos após a saída do pedido para entrega.\n\nAgradecemos pela preferência e confiança. Será um prazer atender você!';

/** À noite a linha das 11:00 não se aplica: a confirmação sai sem esse aviso. */
export const NIGHT_ORDER_CONFIRMED_MESSAGE = 'Prontinho! Seu pedido foi confirmado!\n\nJá deixamos tudo organizado por aqui.\n\nO prazo estimado de entrega é de 30 a 45 minutos após a saída do pedido para entrega.\n\nAgradecemos pela preferência e confiança. Será um prazer atender você!';

/** Texto enviado ao aceitar um pedido: à noite usa a versão sem o aviso das 11:00. */
export function orderConfirmedMessage(now = new Date()): string {
  return botWindow(now) === 'night' ? NIGHT_ORDER_CONFIRMED_MESSAGE : ORDER_CONFIRMED_MESSAGE;
}

/** Only the atomic acceptance job owns the confirmation; Pix-key jobs are separate. */
export function isOrderConfirmationJob(key: string): boolean {
  return key.startsWith('accepted:') && !key.endsWith(':pix-key');
}

export function canSendOrderConfirmation(status?: string): boolean {
  return status === 'accepted';
}
