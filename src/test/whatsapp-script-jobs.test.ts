import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBusiness } from '@/lib/whatsapp-business';
import { HANDOFF_MESSAGE } from '@/lib/whatsapp-rulebot';

vi.mock('@/lib/whatsapp.server', () => ({
  gateway: vi.fn(), sendText: vi.fn(), sendTyping: vi.fn(), digits: (s: string) => s,
}));
vi.mock('@lovable.dev/ai-gateway', () => ({ generateResponse: vi.fn(), GatewayError: class GatewayError extends Error {} }));
vi.mock('@/lib/payment-receipts.server', () => ({ processReceipt: vi.fn() }));

import { processJobs } from '@/lib/whatsapp-automation.server';
import { sendText } from '@/lib/whatsapp.server';

type Db = Parameters<typeof processJobs>[0];
type Job = { id: string; phone: string; kind: string; dedup_key: string; payload: Record<string, unknown> };

function mockDb(job: Job, { paused = false, latestInbound = 'wamid.old' } = {}) {
  const updates: Record<string, unknown>[] = [];
  let claims = 0;
  const db = {
    from(table: string) {
      let direction = '';
      let update: Record<string, unknown> | undefined;
      const q = {
        select: () => q,
        eq: (field: string, value: string) => { if (field === 'direction') direction = value; return q; },
        gte: () => q,
        order: () => q,
        limit: () => q,
        single: async () => ({
          data: table === 'whatsapp_settings'
            ? { business: defaultBusiness, account_state: 'ok', auto_reply_enabled: true }
            : { automation_paused: paused, last_inbound_at: new Date().toISOString() },
          error: null,
        }),
        maybeSingle: async () => ({ data: null, error: null }),
        update: (data: Record<string, unknown>) => { update = data; updates.push(data); return q; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: update ? null : table === 'whatsapp_messages' && direction === 'in' ? [{ wa_message_id: latestInbound }] : [],
          error: null,
        }).then(resolve),
      };
      return q;
    },
    rpc: async () => ({ data: claims++ === 0 ? [job] : [], error: null }),
  };
  return { db: db as unknown as Db, updates };
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('Sequências e transferência do roteiro geral', () => {
  it('cancela uma parte pendente quando o cliente responde durante a sequência', async () => {
    const job = { id: 'job-1', phone: '5573999999999', kind: 'text', dedup_key: 'campaign:today:1:phone', payload: { text: 'Parte pendente', inboundId: 'wamid.old', automatic: true } };
    const { db, updates } = mockDb(job, { latestInbound: 'wamid.new' });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('aguarda três segundos entre partes quando não há nova resposta', async () => {
    vi.useFakeTimers();
    vi.mocked(sendText).mockResolvedValue('wamid.sent');
    const job = { id: 'job-1', phone: '5573999999999', kind: 'text', dedup_key: 'campaign:today:1:phone', payload: { text: 'Parte atual', inboundId: 'wamid.old', automatic: true } };
    const { db } = mockDb(job);
    const processing = processJobs(db, 1);
    await vi.advanceTimersByTimeAsync(2999);
    expect(sendText).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await processing;
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('envia o aviso de transferência mesmo pausando o restante da automação', async () => {
    vi.useFakeTimers();
    vi.mocked(sendText).mockResolvedValue('wamid.handoff');
    const job = { id: 'job-1', phone: '5573999999999', kind: 'text', dedup_key: 'handoff:wamid.old', payload: { text: HANDOFF_MESSAGE, automatic: true } };
    const { db } = mockDb(job, { paused: true });
    const processing = processJobs(db, 1);
    await vi.advanceTimersByTimeAsync(3000);
    await processing;
    expect(sendText).toHaveBeenCalledWith(db, '5573999999999', HANDOFF_MESSAGE, { source: 'auto', replyTo: 'job-1', orderId: null });
  });
});
