import { describe, expect, it, vi } from 'vitest';
import { EXTERNAL_DELIVERY_HEALTH_URL, EXTERNAL_DELIVERY_ORDERS_URL, checkExternalDeliveryConnection, sendExternalDeliveryOrder, sendSignedExternalDeliveryOrder } from '@/lib/delivery-integration-http';
import { verifyWebhookRequest } from '@lovable.dev/webhooks-js';
import type { ExternalDeliveryPayload } from '@/lib/delivery-integration';

const payload: ExternalDeliveryPayload = {
  order_id: 'order-abc', order_number: '901', customer_name: 'Maria Silva',
  address: 'Rua das Flores, 123', items: [{ name: 'Marmita completa', quantity: 1 }],
  total: 19.9, delivery_type: 'delivery',
};

describe('comunicação HTTP com UltraBrasa Entregas', () => {
  it('envia para a URL confirmada, preserva o identificador e inclui os cabeçalhos de autenticação', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, code: 'duplicate' }), { status: 200 }));
    const result = await sendExternalDeliveryOrder(payload, { 'x-test-authentication': 'secret' }, fetcher);
    expect(result).toEqual({ ok: true, status: 200, code: 'duplicate' });
    expect(fetcher).toHaveBeenCalledWith(EXTERNAL_DELIVERY_ORDERS_URL, expect.objectContaining({ method: 'POST' }));
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ 'x-test-authentication': 'secret', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body)).order_id).toBe('order-abc');
  });

  it('não confunde a página HTML do site com uma verificação válida da integração', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<!DOCTYPE html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    expect(await checkExternalDeliveryConnection(fetcher)).toEqual({ ok: false, status: 200, code: 'invalid_response' });
    expect(fetcher).toHaveBeenCalledWith(EXTERNAL_DELIVERY_HEALTH_URL, expect.anything());
  });

  it('assina o envio no padrão que a outra conta consegue verificar', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, code: 'created' }), { status: 200 }));
    const result = await sendSignedExternalDeliveryOrder(payload, 'shared-secret', fetcher);
    expect(result.ok).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    const signedRequest = new Request(url, init);
    const verified = await verifyWebhookRequest({ req: signedRequest, secret: 'shared-secret' });
    expect(verified.payload).toMatchObject({ order_id: 'order-abc', total: 19.9 });
    expect(signedRequest.headers.get('x-lovable-delivery')).toBe('order-abc');
  });

  it('devolve falha controlada quando a outra conta está indisponível', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network unavailable'));
    expect(await sendExternalDeliveryOrder(payload, {}, fetcher)).toEqual({ ok: false, status: null, code: 'unavailable' });
  });
});
