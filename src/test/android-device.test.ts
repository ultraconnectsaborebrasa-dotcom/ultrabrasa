import { describe, expect, it } from 'vitest';
import { androidExchangeInput, androidPairInput, deviceBearer, newPairCode, sha256 } from '@/lib/android-device';

describe('Credencial Android limitada ao próprio GPS', () => {
  it('exige código com 128 bits e segredo com 256 bits no pareamento', () => {
    expect(androidPairInput.safeParse({ action: 'pair', code: 'a'.repeat(32), secret: 'b'.repeat(64) }).success).toBe(true);
    expect(androidPairInput.safeParse({ action: 'pair', code: '1234', secret: 'b'.repeat(64) }).success).toBe(false);
    expect(newPairCode()).toMatch(/^[a-f0-9]{32}$/);
  });
  it('não aceita uma conta ou entregador escolhido pelo aparelho como credencial', () => {
    expect(deviceBearer('Bearer entregador-1')).toBeNull();
    expect(deviceBearer(null)).toBeNull();
    expect(deviceBearer(`Bearer ${'b'.repeat(64)}`)).toBe('b'.repeat(64));
    expect(androidExchangeInput.safeParse({ action: 'read_orders' }).success).toBe(false);
  });
  it('rejeita coordenadas e precisão fora dos limites reais', () => {
    const position = { action: 'location', latitude: -16.35, longitude: -39.57, accuracy: 10, observedAt: '2026-11-25T18:00:00.000Z' };
    expect(androidExchangeInput.safeParse(position).success).toBe(true);
    expect(androidExchangeInput.safeParse({ ...position, latitude: 91 }).success).toBe(false);
    expect(androidExchangeInput.safeParse({ ...position, longitude: -181 }).success).toBe(false);
    expect(androidExchangeInput.safeParse({ ...position, accuracy: -1 }).success).toBe(false);
    expect(androidExchangeInput.safeParse({ ...position, latitude: NaN }).success).toBe(false);
  });
  it('guarda somente o hash determinístico da credencial', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});