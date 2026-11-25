import { z } from 'zod';

export const androidPairInput = z.object({
  action: z.literal('pair'),
  code: z.string().regex(/^[a-f0-9]{32}$/),
  secret: z.string().regex(/^[a-f0-9]{64}$/),
  fcmToken: z.string().max(4096).optional(),
});
export const androidExchangeInput = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['status', 'resume', 'pause']) }),
  z.object({ action: z.literal('location'), latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), accuracy: z.number().finite().min(0).max(100000), observedAt: z.string().datetime() }),
]);
export function deviceBearer(value: string | null): string | null {
  return value?.match(/^Bearer ([a-f0-9]{64})$/)?.[1] ?? null;
}
export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function newPairCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}