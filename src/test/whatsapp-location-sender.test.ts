import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendLocation, shouldUseLocationFallback } from '@/lib/whatsapp.server';
import { STORE_LOCATION, STORE_LOCATION_MAPS_MESSAGE, STORE_LOCATION_MAPS_URL } from '@/lib/whatsapp-rulebot';

type Row = Record<string, unknown>;
function mockDatabase() {
  const inserts: Row[] = [];
  const updates: Row[] = [];
  const db = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        insert: (row: Row) => { inserts.push(row); return q; },
        update: (row: Row) => { updates.push(row); return q; },
        upsert: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: { unread: 0, name: 'Cliente' }, error: null }),
        single: async () => table === 'whatsapp_settings'
          ? { data: { account_state: 'ok' }, error: null }
          : table === 'whatsapp_conversations'
            ? { data: { last_inbound_at: new Date().toISOString() }, error: null }
            : { data: { id: 'outbound-1' }, error: null },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  return { db: db as unknown as Parameters<typeof sendLocation>[0], inserts, updates };
}

const success = (id: string) => new Response(JSON.stringify({ messages: [{ id }] }), { status: 200 });

beforeEach(() => {
  vi.stubEnv('LOVABLE_API_KEY', 'test-key');
  vi.stubEnv('WHATSAPP_API_KEY', 'test-connection');
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('localização nativa da loja', () => {
  it('envia as coordenadas e o endereço no formato location do WhatsApp', async () => {
    vi.mocked(fetch).mockResolvedValue(success('wamid.location'));
    const { db, inserts } = mockDatabase();
    await expect(sendLocation(db, '5573999999999', STORE_LOCATION, { fallbackText: STORE_LOCATION_MAPS_MESSAGE, source: 'auto', replyTo: 'job-1' })).resolves.toBe('wamid.location');
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ type: 'location', location: { latitude: -16.35, longitude: -39.5746, name: 'Ultrabrasa' } });
    expect(inserts[0]).toMatchObject({ kind: 'location', status: 'sending' });
  });

  it('usa o link do Maps somente quando o formato nativo é recusado', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: '(#100) Invalid parameter: location' } }), { status: 400 }))
      .mockResolvedValueOnce(success('wamid.maps'));
    const { db, updates } = mockDatabase();
    await expect(sendLocation(db, '5573999999999', STORE_LOCATION, { fallbackText: STORE_LOCATION_MAPS_MESSAGE })).resolves.toBe('wamid.maps');
    expect(fetch).toHaveBeenCalledTimes(2);
    const fallbackInit = vi.mocked(fetch).mock.calls[1]?.[1];
    const body = JSON.parse(String(fallbackInit?.body));
    expect(body.type).toBe('text');
    expect(body.text.body).toContain(STORE_LOCATION_MAPS_URL);
    expect(updates).toContainEqual({ kind: 'text', body: STORE_LOCATION_MAPS_MESSAGE });
  });

  it('não repete o envio em erro de permissão ou em falha ambígua', async () => {
    expect(shouldUseLocationFallback(new Error('WhatsApp [403]: permission denied'))).toBe(false);
    expect(shouldUseLocationFallback(new Error('NetworkError'))).toBe(false);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { message: 'permission denied' } }), { status: 403 }));
    const { db } = mockDatabase();
    await expect(sendLocation(db, '5573999999999', STORE_LOCATION, { fallbackText: STORE_LOCATION_MAPS_MESSAGE })).rejects.toThrow('WhatsApp [403]');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
