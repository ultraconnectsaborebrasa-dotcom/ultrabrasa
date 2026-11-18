import { createHmac } from 'crypto';

export function createDeliverySignatureHeaders(rawBody: string, secret: string, deliveryId: string, timestamp = Math.floor(Date.now() / 1000)): Record<string, string> {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return {
    'x-lovable-signature': `sha256=${signature}`,
    'x-lovable-timestamp': String(timestamp),
    'x-lovable-delivery': deliveryId,
    'x-lovable-event': 'pdv.order.upsert',
  };
}
