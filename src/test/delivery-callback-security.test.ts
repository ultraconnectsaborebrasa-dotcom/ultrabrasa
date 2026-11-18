import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { parseSignedDeliveryCallback } from '@/lib/delivery-callback-security';

const secret = 'test-shared-secret';
const body = JSON.stringify({ event: 'test' });
const timestamp = () => String(Math.floor(Date.now() / 1000));
const signature = (at: string, value = body) => createHmac('sha256', secret).update(`${at}.${value}`).digest('hex');
const request = (headers: Record<string, string>, value = body) => new Request('https://ultraconnectbrasa.com.br/api/public/entregas/retorno', { method: 'POST', headers, body: value });

describe('assinatura do retorno de entregas', () => {
  it('aceita uma assinatura HMAC válida nos cabeçalhos do PDV', async () => {
    const at = timestamp();
    const signed = request({ 'x-pdv-timestamp': at, 'x-pdv-signature': `sha256=${signature(at)}` });
    await expect(parseSignedDeliveryCallback(signed, secret)).resolves.toEqual({ event: 'test' });
  });

  it('aceita o padrão Lovable com assinatura em base64', async () => {
    const at = timestamp();
    const encoded = createHmac('sha256', secret).update(`${at}.${body}`).digest('base64');
    const signed = request({ 'x-lovable-timestamp': at, 'x-lovable-signature': encoded });
    await expect(parseSignedDeliveryCallback(signed, secret)).resolves.toEqual({ event: 'test' });
  });

  it('rejeita conteúdo alterado depois da assinatura', async () => {
    const at = timestamp();
    const signed = request({ 'x-pdv-timestamp': at, 'x-pdv-signature': signature(at) }, JSON.stringify({ event: 'delivery.cancelled' }));
    await expect(parseSignedDeliveryCallback(signed, secret)).resolves.toBeNull();
  });

  it('rejeita uma assinatura antiga para evitar reutilização', async () => {
    const at = String(Math.floor(Date.now() / 1000) - 600);
    const signed = request({ 'x-pdv-timestamp': at, 'x-pdv-signature': signature(at) });
    await expect(parseSignedDeliveryCallback(signed, secret)).resolves.toBeNull();
  });
});
