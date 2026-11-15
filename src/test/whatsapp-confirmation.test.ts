import { describe, it, expect } from 'vitest';
import { isOrderConfirmationJob, canSendOrderConfirmation, ORDER_CONFIRMED_MESSAGE } from '@/lib/whatsapp-confirmation';

describe('Confirmed-order notification ownership', () => {
  it('uses the confirmed message with departure at 11 and estimate after departure', () => {
    expect(ORDER_CONFIRMED_MESSAGE).toContain('Prontinho! Seu pedido foi confirmado!');
    expect(ORDER_CONFIRMED_MESSAGE).toContain('começam a sair a partir das 11:00');
    expect(ORDER_CONFIRMED_MESSAGE).toContain('30 a 45 minutos após a saída do pedido');
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