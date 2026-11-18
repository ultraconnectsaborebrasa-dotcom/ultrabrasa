import { createHmac, timingSafeEqual } from 'crypto';
import { verifyWebhookRequest } from '@lovable.dev/webhooks-js';

const MAX_BODY_BYTES = 128 * 1024;
const signatureHeaders = ['x-pdv-signature', 'x-pdv-signature-256', 'x-delivery-signature', 'x-webhook-signature', 'x-signature', 'x-signature-256', 'x-lovable-signature'];
const timestampHeaders = ['x-pdv-timestamp', 'x-delivery-timestamp', 'x-webhook-timestamp', 'x-timestamp', 'x-lovable-timestamp'];
const firstHeader = (headers: Headers, names: string[]) => {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }
  return null;
};

function signatureMatches(rawBody: string, timestamp: string, supplied: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const normalized = supplied.trim().replace(/^sha256=/i, '');
  try {
    const received = /^[a-f0-9]{64}$/i.test(normalized) ? Buffer.from(normalized, 'hex') : Buffer.from(normalized, 'base64');
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

export async function parseSignedDeliveryCallback(request: Request, secret: string): Promise<unknown | null> {
  try {
    const { payload } = await verifyWebhookRequest({ req: request.clone(), secret, maxBodyBytes: MAX_BODY_BYTES });
    return payload as unknown;
  } catch {
    // A outra conta pode usar nomes de cabeçalho próprios; a assinatura continua obrigatória.
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return null;
  const timestamp = firstHeader(request.headers, timestampHeaders);
  const signature = firstHeader(request.headers, signatureHeaders);
  if (!timestamp || !signature) return null;
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp)) return null;
  const milliseconds = numericTimestamp < 10_000_000_000 ? numericTimestamp * 1000 : numericTimestamp;
  if (Math.abs(Date.now() - milliseconds) > 5 * 60 * 1000) return null;
  if (!signatureMatches(rawBody, timestamp, signature, secret)) return null;
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}
