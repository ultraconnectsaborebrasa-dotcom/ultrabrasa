import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBusiness } from '@/lib/whatsapp-business';
import { MENU_REMINDER_DELAY_MS, MENU_REMINDER_MESSAGE } from '@/lib/whatsapp-rulebot';

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

function mockDb(job: Job, { paused = false, latestInbound = 'wamid.old' } = {}) {
  let claims = 0;
  const queued: QueuedJob[] = [];
  const updates: Record<string, unknown>[] = [];
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
            : { automation_paused: paused, automation_pause_reason: paused ? 'human' : null, attendance_status: paused ? 'in_service' : 'new', assigned_to: paused ? 'staff' : null, last_inbound_at: new Date().toISOString() },
          error: null,
        }),
        maybeSingle: async () => ({ data: null, error: null }),
        update: (data: Record<string, unknown>) => { update = data; updates.push(data); return q; },
        upsert: async (data: QueuedJob) => { if (!queued.some(item => item.dedup_key === data.dedup_key)) queued.push(data); return { data: null, error: null }; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: update ? [] : table === 'whatsapp_messages' && direction === 'in' ? [{ wa_message_id: latestInbound }] : [],
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

describe('Lembrete cinco minutos após o cardápio', () => {
  it('usa exatamente a mensagem confirmada pelo responsável', () => {
    expect(MENU_REMINDER_MESSAGE).toBe('Oi! Tudo bem? 😊 Já escolheu o que vai pedir? Aproveite nossa promoção com entrega grátis para toda Eunápolis. Estamos esperando seu pedido! ❤️');
  });

  it('agenda exatamente cinco minutos somente depois do envio do cardápio ser aceito', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T15:00:00.000Z'));
    let menuAcceptedAt = 0;
    vi.mocked(sendText).mockImplementation(async () => { menuAcceptedAt = Date.now(); return 'wamid.menu'; });
    const job = { id: 'menu-job', phone: '5573999999999', kind: 'text', dedup_key: 'campaign:today:2:phone', payload: { text: 'Hoje de cardápio temos:\n\nMarmita completa', inboundId: 'wamid.old', automatic: true } };
    const { db, queued } = mockDb(job);
    expect(MENU_REMINDER_DELAY_MS).toBe(300000);
    await finishTimers(db);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      dedup_key: 'menu-reminder:wamid.old:5573999999999',
      kind: 'text',
      payload: { text: MENU_REMINDER_MESSAGE, automatic: true, inboundId: 'wamid.old' },
    });
    expect(menuAcceptedAt).toBeGreaterThan(0);
    expect(Date.parse(queued[0]!.next_attempt_at) - menuAcceptedAt).toBe(300000);
  });

  it('envia uma única mensagem de acompanhamento quando não houve resposta', async () => {
    vi.useFakeTimers();
    vi.mocked(sendText).mockResolvedValue('wamid.reminder');
    const job = { id: 'reminder-job', phone: '5573999999999', kind: 'text', dedup_key: 'menu-reminder:wamid.old:phone', payload: { text: MENU_REMINDER_MESSAGE, inboundId: 'wamid.old', automatic: true } };
    const { db } = mockDb(job);
    await finishTimers(db);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(db, '5573999999999', MENU_REMINDER_MESSAGE, { source: 'auto', replyTo: 'reminder-job', orderId: null });
  });

  it('cancela o lembrete se o cliente responder antes dos cinco minutos', async () => {
    const job = { id: 'reminder-job', phone: '5573999999999', kind: 'text', dedup_key: 'menu-reminder:wamid.old:phone', payload: { text: MENU_REMINDER_MESSAGE, inboundId: 'wamid.old', automatic: true } };
    const { db, updates } = mockDb(job, { latestInbound: 'wamid.new' });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('cancela o lembrete quando um atendente assume a conversa', async () => {
    const job = { id: 'reminder-job', phone: '5573999999999', kind: 'text', dedup_key: 'menu-reminder:wamid.old:phone', payload: { text: MENU_REMINDER_MESSAGE, inboundId: 'wamid.old', automatic: true } };
    const { db, updates } = mockDb(job, { paused: true });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('não agenda lembrete quando o cardápio não é aceito para envio', async () => {
    vi.useFakeTimers();
    vi.mocked(sendText).mockRejectedValue(new Error('WhatsApp [400]: envio recusado'));
    const job = { id: 'menu-job', phone: '5573999999999', kind: 'text', dedup_key: 'campaign:today:2:phone', payload: { text: 'Hoje de cardápio temos:\n\nMarmita completa', inboundId: 'wamid.old', automatic: true } };
    const { db, queued } = mockDb(job);
    await finishTimers(db);
    expect(queued).toHaveLength(0);
  });
});
