import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBusiness } from '@/lib/whatsapp-business';
import { CONFIRM_HINT, ORDER_CONFIRMATION_REMINDER_DELAY_MS } from '@/lib/whatsapp-rulebot';

vi.mock('@/lib/whatsapp.server', () => ({
  gateway: vi.fn(), sendText: vi.fn(), sendTyping: vi.fn(), digits: (s: string) => s,
}));
vi.mock('@lovable.dev/ai-gateway', () => ({ generateResponse: vi.fn(), GatewayError: class GatewayError extends Error {} }));
vi.mock('@/lib/payment-receipts.server', () => ({ processReceipt: vi.fn() }));

import { processJobs } from '@/lib/whatsapp-automation.server';
import { sendText } from '@/lib/whatsapp.server';

type Db = Parameters<typeof processJobs>[0];
type Job = { id: string; phone: string; kind: string; dedup_key: string; payload: Record<string, unknown> };
type QueuedJob = Record<string, unknown> & { dedup_key: string; next_attempt_at: string; payload: Record<string, unknown> };

const summaryText = 'Perfeito! ❤️ Confira seu pedido:\n\n1 marmita\n\nEstá tudo certinho? Posso confirmar seu pedido?';
const summaryJob: Job = {
  id: 'summary-job', phone: '5573999999999', kind: 'text', dedup_key: 'reply:wamid.old',
  payload: { text: summaryText, automatic: true, inboundId: 'wamid.old', summaryVersion: 3, summaryTotal: 19.9, confirmationPrompt: true },
};
const reminderJob: Job = {
  id: 'confirmation-reminder-job', phone: '5573999999999', kind: 'text', dedup_key: 'confirmation-reminder:3:phone',
  payload: { text: CONFIRM_HINT, automatic: true, inboundId: 'wamid.old', summaryVersion: 3, summaryTotal: 19.9, confirmationReminder: true },
};

function mockDb(job: Job, {
  paused = false,
  latestInbound = 'wamid.old',
  orderConfirmed = false,
  draftVersion = 3,
  summarySent = true,
} = {}) {
  let claims = 0;
  const queued: QueuedJob[] = [];
  const updates: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      let direction = '';
      let update: Record<string, unknown> | undefined;
      const q = {
        select: () => q,
        eq: (field: string, value: unknown) => { if (field === 'direction') direction = String(value); return q; },
        gte: () => q,
        order: () => q,
        limit: () => q,
        single: async () => ({
          data: table === 'whatsapp_settings'
            ? { business: defaultBusiness, account_state: 'ok', auto_reply_enabled: true }
            : {
                automation_paused: paused,
                automation_pause_reason: orderConfirmed ? 'order_confirmed' : paused ? 'human' : null,
                attendance_status: paused ? 'in_service' : 'new',
                assigned_to: paused ? 'staff' : null,
                last_inbound_at: new Date().toISOString(),
                order_confirmed_at: orderConfirmed ? new Date().toISOString() : null,
                draft: { summarySent, quotedTotal: 19.9 },
                draft_version: draftVersion,
              },
          error: null,
        }),
        maybeSingle: async () => ({ data: null, error: null }),
        update: (data: Record<string, unknown>) => { update = data; updates.push(data); return q; },
        upsert: async (data: QueuedJob) => { if (!queued.some(item => item.dedup_key === data.dedup_key)) queued.push(data); return { data: null, error: null }; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: update ? [{ phone: '5573999999999' }] : table === 'whatsapp_messages' && direction === 'in' ? [{ wa_message_id: latestInbound }] : [],
          error: null,
        }).then(resolve),
      };
      return q;
    },
    rpc: async () => ({ data: claims++ === 0 ? [job] : [], error: null }),
  };
  return { db: db as unknown as Db, queued, updates };
}

async function finishTimers(db: Db) {
  const processing = processJobs(db, 1);
  await vi.advanceTimersByTimeAsync(3500);
  await processing;
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('Lembrete de confirmação após dois minutos', () => {
  it('usa o texto combinado e exatamente dois minutos', () => {
    expect(CONFIRM_HINT).toBe('É só responder *SIM* para eu confirmar seu pedido. Se quiser mudar algo, me fala o que corrigir.');
    expect(ORDER_CONFIRMATION_REMINDER_DELAY_MS).toBe(120000);
  });

  it('agenda somente depois do resumo ser aceito para envio', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T15:00:00.000Z'));
    let acceptedAt = 0;
    vi.mocked(sendText).mockImplementation(async () => { acceptedAt = Date.now(); return 'wamid.summary'; });
    const { db, queued } = mockDb(summaryJob);
    await finishTimers(db);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      dedup_key: 'confirmation-reminder:3:5573999999999',
      payload: { text: CONFIRM_HINT, automatic: true, inboundId: 'wamid.old', summaryVersion: 3, confirmationReminder: true },
    });
    expect(Date.parse(queued[0]!.next_attempt_at) - acceptedAt).toBe(120000);
  });

  it('envia a orientação de confirmação quando o cliente não responde', async () => {
    vi.useFakeTimers();
    vi.mocked(sendText).mockResolvedValue('wamid.confirmation-reminder');
    const { db } = mockDb(reminderJob);
    await finishTimers(db);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(db, '5573999999999', CONFIRM_HINT, { source: 'auto', replyTo: 'confirmation-reminder-job', orderId: null });
  });

  it('cancela quando o cliente responde antes do lembrete', async () => {
    const { db, updates } = mockDb(reminderJob, { latestInbound: 'wamid.new' });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('cancela quando o pedido já foi confirmado', async () => {
    const { db, updates } = mockDb(reminderJob, { orderConfirmed: true });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('cancela o lembrete antigo quando o cliente corrigiu o resumo', async () => {
    const { db, updates } = mockDb(reminderJob, { draftVersion: 4 });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('cancela quando um atendente assume a conversa', async () => {
    const { db, updates } = mockDb(reminderJob, { paused: true });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('não agenda se o resumo não foi aceito para envio', async () => {
    vi.useFakeTimers();
    vi.mocked(sendText).mockRejectedValue(new Error('WhatsApp [400]: envio recusado'));
    const { db, queued } = mockDb(summaryJob);
    await finishTimers(db);
    expect(queued).toHaveLength(0);
  });
});
