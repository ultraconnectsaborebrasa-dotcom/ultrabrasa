import { z } from 'zod';

export const androidLoginRequest = z.object({
  state: z.string().regex(/^[a-f0-9]{64}$/),
  key: z.string().regex(/^[A-Za-z0-9_-]{350,600}$/),
});
export const androidSession = z.object({
  access_token: z.string().min(20).max(12000),
  refresh_token: z.string().min(10).max(1000),
});
export function encodeAndroidBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeAndroidBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
}

/** Only an explicit intent to our installed package receives the encrypted session. */
export async function androidReturnIntent(request: z.infer<typeof androidLoginRequest>, session: z.infer<typeof androidSession>): Promise<string> {
  const input = androidLoginRequest.parse(request);
  const tokens = androidSession.parse(session);
  const publicKey = await crypto.subtle.importKey('spki', decodeAndroidBytes(input.key), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(input.state) }, key, new TextEncoder().encode(JSON.stringify(tokens)));
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, await crypto.subtle.exportKey('raw', key));
  const envelope = [input.state, encodeAndroidBytes(new Uint8Array(wrapped)), encodeAndroidBytes(iv), encodeAndroidBytes(new Uint8Array(data))].join('.');
  return `intent://login#Intent;scheme=ultraconnect-entregas;package=br.com.ultraconnect.entregas;S.envelope=${envelope};end`;
}