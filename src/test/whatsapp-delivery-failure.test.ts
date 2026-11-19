import { describe, expect, it, vi } from 'vitest';
import { processEvent } from '@/lib/whatsapp.server';
import { defaultBusiness } from '@/lib/whatsapp-business';

type Db = Parameters<typeof processEvent>[0];

function statusDb(errors: unknown) {
  const updates: Record<string, unknown>[] = [];
  const db = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from(table: string) {
      let mode = 'read';
      const q = {
        select: () => q,
        eq: () => q,
        single: async () => ({ data: table === 'whatsapp_settings' ? { business: defaultBusiness } : null, error: null }),
        update: (value: Record<string, unknown>) => { mode = 'update'; updates.push(value); return q; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null, mode }).then(resolve),
      };
      return q;
    },
  } as unknown as Db;
  return { db, updates, errors };
}

function event(errors: unknown) {
  return { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.out', status: 'failed', timestamp: '1763565000', errors }] } }] }] };
}

describe('falha definitiva de entrega do WhatsApp', () => {
  it.each([131042, 131026])('não pausa o robô pela falha %s do provedor', async code => {
    const { db, updates } = statusDb([{ code }]);
    await processEvent(db, 'whatsapp.status', event([{ code }]));
    expect(updates).toHaveLength(0);
  });
});
