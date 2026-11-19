import { describe, expect, it, vi } from 'vitest';
import { processEvent, WHATSAPP_CURRENCY_ERROR } from '@/lib/whatsapp.server';
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
  it('pausa o envio automático quando a moeda da conta não está configurada', async () => {
    const { db, updates } = statusDb([{ code: 131042 }]);
    await processEvent(db, 'whatsapp.status', event([{ code: 131042 }]));
    expect(updates).toContainEqual(expect.objectContaining({
      business: expect.objectContaining({ circuitPaused: true, circuitReason: WHATSAPP_CURRENCY_ERROR }),
    }));
  });

  it('não pausa o robô por uma falha diferente', async () => {
    const { db, updates } = statusDb([{ code: 131026 }]);
    await processEvent(db, 'whatsapp.status', event([{ code: 131026 }]));
    expect(updates).toHaveLength(0);
  });
});
