import { describe, it, expect } from 'vitest';
import {
  isOrderConfirmationJob,
  canSendOrderConfirmation,
  ORDER_CONFIRMED_MESSAGE,
  NIGHT_ORDER_CONFIRMED_MESSAGE,
  orderConfirmedMessage,
} from '@/lib/whatsapp-confirmation';

describe('Confirmed-order notification ownership', () => {
  it('keeps the lunch message with departure at 11 and estimate after departure', () => {
    expect(ORDER_CONFIRMED_MESSAGE).toContain('Prontinho! Seu pedido foi confirmado!');
    expect(ORDER_CONFIRMED_MESSAGE).toContain('começam a sair a partir das 11:00');
    expect(ORDER_CONFIRMED_MESSAGE).toContain('30 a 45 minutos após a saída do pedido');
  });
  it('uses the agreed night text without the 11:00 departure line', () => {
    expect(NIGHT_ORDER_CONFIRMED_MESSAGE).toBe(
      'Prontinho! Seu pedido foi confirmado!\n\nJá deixamos tudo organizado por aqui.\n\nO prazo estimado de entrega é de 30 a 45 minutos após a saída do pedido para entrega.\n\nAgradecemos pela preferência e confiança. Será um prazer atender você!',
    );
    expect(NIGHT_ORDER_CONFIRMED_MESSAGE).not.toContain('11:00');
  });
  it('picks the night message during the night window and the lunch one at lunch', () => {
    expect(orderConfirmedMessage(new Date('2026-11-22T22:50:00Z'))).toBe(NIGHT_ORDER_CONFIRMED_MESSAGE);
    expect(orderConfirmedMessage(new Date('2026-11-22T14:00:00Z'))).toBe(ORDER_CONFIRMED_MESSAGE);
  });
  it('uses one order-keyed acceptance job, not the inbound reply', () => {
    expect(isOrderConfirmationJob('accepted:wa-request-1')).toBe(true);
    expect(isOrderConfirmationJob('sent:wamid.confirmation')).toBe(false);
  });
  it('preserves the separate Pix-key job without another confirmation', () => {
    expect(isOrderConfirmationJob('accepted:wa-request-1:pix-key')).toBe(false);
  });
  it('requires persisted acceptance, never merely a complete draft or awaiting request', () => {
    expect(canSendOrderConfirmation('accepted')).toBe(true);
    expect(canSendOrderConfirmation('awaiting_acceptance')).toBe(false);
    expect(canSendOrderConfirmation()).toBe(false);
  });
});
