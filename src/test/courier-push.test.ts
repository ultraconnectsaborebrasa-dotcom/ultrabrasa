import { describe, expect, it } from 'vitest';
import { courierPushMessage, courierInitials } from '@/lib/courier-push';

describe('alertas individuais', () => {
  it('envia só ao aparelho escolhido com prioridade alta e sem valores financeiros', () => {
    const value = courierPushMessage('aparelho-daniel', 'nova-entrega');
    expect(value.message.token).toBe('aparelho-daniel');
    expect(value.message.android.priority).toBe('HIGH');
    expect(value.message.android.ttl).toBe('900s');
    expect(value.message).not.toHaveProperty('topic');
    expect(value.message.data).not.toHaveProperty('total');
  });
  it('identifica entregadores por até duas iniciais sem perder acentos', () => {
    expect(courierInitials(' Daniel Silva ')).toBe('DS');
    expect(courierInitials('Érica')).toBe('É');
    expect(courierInitials('')).toBe('?');
  });
});