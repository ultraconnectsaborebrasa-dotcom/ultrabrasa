import { externalDeliverySchema, type ExternalDeliveryPayload } from '@/lib/delivery-integration';

export const EXTERNAL_DELIVERY_ORDERS_URL = 'https://project--ad4cd978-a9c4-4678-aa58-5b7f8d65df9e.lovable.app/api/public/pdv/orders';
export const EXTERNAL_DELIVERY_HEALTH_URL = 'https://project--ad4cd978-a9c4-4678-aa58-5b7f8d65df9e.lovable.app/api/public/pdv/health';

type Fetcher = typeof fetch;
export type ExternalDeliveryHttpResult =
  | { ok: true; status: number; code: string }
  | { ok: false; status: number | null; code: string };

async function responseResult(response: Response): Promise<ExternalDeliveryHttpResult> {
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, status: response.status, code: 'invalid_response' };
  }
  const record = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const rawCode = record['code'] ?? record['error'] ?? record['status'];
  const code = typeof rawCode === 'string' && rawCode.length <= 80 ? rawCode : response.ok ? 'ok' : `http_${response.status}`;
  if (!response.ok || record['ok'] === false || record['error']) return { ok: false, status: response.status, code };
  return { ok: true, status: response.status, code };
}

async function requestExternal(request: () => Promise<Response>): Promise<ExternalDeliveryHttpResult> {
  try {
    return await responseResult(await request());
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { ok: false, status: null, code: timedOut ? 'timeout' : 'unavailable' };
  }
}

export function sendExternalDeliveryOrder(
  payload: ExternalDeliveryPayload,
  authenticationHeaders: Record<string, string>,
  fetcher: Fetcher = fetch,
): Promise<ExternalDeliveryHttpResult> {
  const validPayload = externalDeliverySchema.parse(payload);
  return requestExternal(() => fetcher(EXTERNAL_DELIVERY_ORDERS_URL, {
    method: 'POST',
    headers: { ...authenticationHeaders, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(validPayload),
    signal: AbortSignal.timeout(10_000),
  }));
}

export function checkExternalDeliveryConnection(fetcher: Fetcher = fetch): Promise<ExternalDeliveryHttpResult> {
  return requestExternal(() => fetcher(EXTERNAL_DELIVERY_HEALTH_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  }));
}
