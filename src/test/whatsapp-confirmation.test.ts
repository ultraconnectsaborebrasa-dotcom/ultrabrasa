import { describe, it, expect } from 'vitest';
import { isOrderConfirmationJob, canSendOrderConfirmation } from '@/lib/whatsapp-confirmation';

describe('Confirmed-order notification ownership', () => {
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