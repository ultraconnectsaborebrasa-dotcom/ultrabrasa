import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBusiness } from '@/lib/whatsapp-business';
import {
  AFTERNOON_MESSAGES,
  AFTERNOON_REMINDER_DELAY_MS,
  AFTERNOON_REMINDER_MESSAGE,
  FIRST_CONTACT_MESSAGE,
  FIRST_CONTACT_REMINDER_DELAY_MS,
  FIRST_CONTACT_REMINDER_MESSAGE,
} from '@/lib/whatsapp-rulebot';

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

const attendanceStartedAt = '2026-11-19T15:00:00.000Z';
const firstJob: Job = {
  id: 'first-job', phone: '5573999999999', kind: 'text',
  dedup_key: `first-contact:${attendanceStartedAt}:phone`,
  payload: { text: FIRST_CONTACT_MESSAGE, inboundId: 'wamid.old', automatic: true, attendanceStartedAt },
};
const reminderJob: Job = {
  id: 'reminder-job', phone: '5573999999999', kind: 'text',
  dedup_key: `first-contact-reminder:${attendanceStartedAt}:phone`,
  payload: { text: FIRST_CONTACT_REMINDER_MESSAGE, inboundId: 'wamid.old', automatic: true, attendanceStartedAt },
};
const afternoonMenuJob: Job = {
  id: 'afternoon-menu-job', phone: '5573999999999', kind: 'text',
  dedup_key: `campaign:${attendanceStartedAt}:afternoon:1:phone`,
  payload: { text: AFTERNOON_MESSAGES[1], inboundId: 'wamid.old', automatic: true, attendanceStartedAt },
};
const afternoonReminderJob: Job = {
  id: 'afternoon-reminder-job', phone: '5573999999999', kind: 'text',
  dedup_key: `afternoon-reminder:${attendanceStartedAt}:phone`,
  payload: { text: AFTERNOON_REMINDER_MESSAGE, inboundId: 'wamid.old', automatic: true, attendanceStartedAt },
};

function mockDb(job: Job, { paused = false, latestInbound = 'wamid.old', orderConfirmed = false } = {}) {
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
            : {
                automation_paused: paused,
                automation_pause_reason: orderConfirmed ? 'order_confirmed' : paused ? 'human' : null,
                attendance_status: paused ? 'in_service' : 'new',
                assigned_to: paused ? 'staff' : null,
                last_inbound_at: new Date().toISOString(),
                order_confirmed_at: orderConfirmed ? new Date().toISOString() : null,
              },
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

describe('Primeiro atendimento e lembrete de três minutos', () => {
  it('usa exatamente as mensagens e o atraso definidos', () => {
    expect(FIRST_CONTACT_MESSAGE).toBe('Olá! Tudo bem? 😊 Você pode conferir nosso cardápio do dia e fazer seu pedido por aqui:\n\n👉 https://ultraconnectbrasa.com.br/marmita-do-dia\n\nConfirmando pelo link, seu pedido já chega para nossa equipe e conseguimos adiantar tudo para despachar mais rapidinho!');
    expect(FIRST_CONTACT_REMINDER_MESSAGE).toBe('E aí, conseguiu? Se teve alguma dificuldade, posso montar seu pedido por aqui mesmo, sem problema!');
    expect(FIRST_CONTACT_REMINDER_DELAY_MS).toBe(180000);
  });

  it('agenda três minutos somente depois da primeira mensagem ser aceita', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T15:00:00.000Z'));
    let menuAcceptedAt = 0;
    vi.mocked(sendText).mockImplementation(async () => { menuAcceptedAt = Date.now(); return 'wamid.menu'; });
    const { db, queued } = mockDb(firstJob);
    await finishTimers(db);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      dedup_key: `first-contact-reminder:${attendanceStartedAt}:5573999999999`,
      kind: 'text',
      payload: { text: FIRST_CONTACT_REMINDER_MESSAGE, automatic: true, inboundId: 'wamid.old', attendanceStartedAt },
    });
    expect(menuAcceptedAt).toBeGreaterThan(0);
    expect(Date.parse(queued[0]!.next_attempt_at) - menuAcceptedAt).toBe(180000);
  });

  it('envia somente o lembrete, sem repetir a abertura ou o link', async () => {
    vi.useFakeTimers();
    vi.mocked(sendText).mockResolvedValue('wamid.reminder');
    const { db } = mockDb(reminderJob);
    await finishTimers(db);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(db, '5573999999999', FIRST_CONTACT_REMINDER_MESSAGE, { source: 'auto', replyTo: 'reminder-job', orderId: null });
    expect(FIRST_CONTACT_REMINDER_MESSAGE).not.toContain('http');
  });

  it('cancela o lembrete se o cliente responder antes dos três minutos', async () => {
    const { db, updates } = mockDb(reminderJob, { latestInbound: 'wamid.new' });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('cancela o lembrete quando um atendente assume a conversa', async () => {
    const { db, updates } = mockDb(reminderJob, { paused: true });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('cancela o lembrete quando o cliente já fez pedido pelo link', async () => {
    const { db, updates } = mockDb(reminderJob, { orderConfirmed: true });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('não agenda lembrete quando a primeira mensagem não é aceita', async () => {
    vi.useFakeTimers();
    vi.mocked(sendText).mockRejectedValue(new Error('WhatsApp [400]: envio recusado'));
    const { db, queued } = mockDb(firstJob);
    await finishTimers(db);
    expect(queued).toHaveLength(0);
  });

  it('cancela o lembrete antigo de cinco minutos sem reenviar', async () => {
    const legacy: Job = { id: 'legacy', phone: '5573999999999', kind: 'text', dedup_key: 'menu-reminder:wamid.old:phone', payload: { text: 'Lembrete antigo', inboundId: 'wamid.old', automatic: true } };
    const { db, updates } = mockDb(legacy);
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });
});

describe('Lembrete do cardápio da tarde', () => {
  it('usa a pergunta confirmada e cinco minutos de espera', () => {
    expect(AFTERNOON_REMINDER_MESSAGE).toBe('E aí, conseguiu escolher? Se precisar de ajuda, posso montar seu pedido por aqui mesmo! 😊');
    expect(AFTERNOON_REMINDER_DELAY_MS).toBe(300000);
    expect(AFTERNOON_REMINDER_MESSAGE).not.toContain('http');
  });

  it('agenda cinco minutos somente depois do cardápio da tarde ser aceito', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T18:00:00.000Z'));
    let menuAcceptedAt = 0;
    vi.mocked(sendText).mockImplementation(async () => { menuAcceptedAt = Date.now(); return 'wamid.afternoon-menu'; });
    const { db, queued } = mockDb(afternoonMenuJob);
    await finishTimers(db);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      dedup_key: `afternoon-reminder:${attendanceStartedAt}:5573999999999`,
      kind: 'text',
      payload: { text: AFTERNOON_REMINDER_MESSAGE, automatic: true, inboundId: 'wamid.old', attendanceStartedAt },
    });
    expect(Date.parse(queued[0]!.next_attempt_at) - menuAcceptedAt).toBe(300000);
  });

  it('não agenda o lembrete depois apenas da apresentação da tarde', async () => {
    vi.useFakeTimers();
    vi.mocked(sendText).mockResolvedValue('wamid.afternoon-opening');
    const openingJob: Job = { ...afternoonMenuJob, dedup_key: `campaign:${attendanceStartedAt}:afternoon:0:phone`, payload: { ...afternoonMenuJob.payload, text: AFTERNOON_MESSAGES[0] } };
    const { db, queued } = mockDb(openingJob);
    await finishTimers(db);
    expect(queued).toHaveLength(0);
  });

  it('envia somente a pergunta, sem repetir o cardápio ou o link', async () => {
    vi.useFakeTimers();
    vi.mocked(sendText).mockResolvedValue('wamid.afternoon-reminder');
    const { db } = mockDb(afternoonReminderJob);
    await finishTimers(db);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(db, '5573999999999', AFTERNOON_REMINDER_MESSAGE, { source: 'auto', replyTo: 'afternoon-reminder-job', orderId: null });
  });

  it('cancela o lembrete da tarde quando o cliente responde', async () => {
    const { db, updates } = mockDb(afternoonReminderJob, { latestInbound: 'wamid.new' });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });

  it('cancela o lembrete da tarde quando já existe pedido confirmado', async () => {
    const { db, updates } = mockDb(afternoonReminderJob, { orderConfirmed: true });
    await processJobs(db, 1);
    expect(sendText).not.toHaveBeenCalled();
    expect(updates.some(update => update['state'] === 'cancelled')).toBe(true);
  });
});
