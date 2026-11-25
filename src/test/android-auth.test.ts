import { describe, expect, it } from 'vitest';
import { androidLoginRequest, androidReturnIntent, decodeAndroidBytes, encodeAndroidBytes } from '@/lib/android-auth';

describe('retorno Google protegido ao Android', () => {
  it('cifra a sessão somente para a chave do aparelho e vincula ao início do login', async () => {
    const keys = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
    const request = { state: 'a'.repeat(64), key: encodeAndroidBytes(new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey))) };
    const session = { access_token: 'test-access-token-only-not-real', refresh_token: 'test-refresh-token-only' };
    const intent = await androidReturnIntent(request, session);
    expect(intent).toContain('package=br.com.ultraconnect.entregas');
    expect(intent).not.toContain(session.access_token);
    const envelope = intent.split('S.envelope=')[1]?.split(';')[0];
    if (!envelope) throw new Error('Missing envelope');
    const [state, wrapped, iv, data] = envelope.split('.');
    if (!state || !wrapped || !iv || !data) throw new Error('Incomplete envelope');
    const keyBytes = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, keys.privateKey, decodeAndroidBytes(wrapped));
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeAndroidBytes(iv), additionalData: new TextEncoder().encode(state) }, key, decodeAndroidBytes(data));
    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual(session);
    await expect(crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeAndroidBytes(iv), additionalData: new TextEncoder().encode('b'.repeat(64)) }, key, decodeAndroidBytes(data))).rejects.toThrow();
  });
  it('recusa um retorno externo ou um identificador sem os 256 bits previstos', () => {
    expect(androidLoginRequest.safeParse({ state: 'external', key: 'https://other.example' }).success).toBe(false);
  });
});