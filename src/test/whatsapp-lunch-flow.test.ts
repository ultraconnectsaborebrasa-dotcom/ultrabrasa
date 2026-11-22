import { afterEach, describe, expect, it, vi } from 'vitest';
import { conversationDraftSchema, defaultBusiness } from '@/lib/whatsapp-business';
import { NIGHT_MESSAGE, NIGHT_MENU_MESSAGE, AFTERNOON_MESSAGES, CLOSING_MESSAGE, HANDOFF_MESSAGE, FIRST_CONTACT_MESSAGE } from '@/lib/whatsapp-rulebot';
import { STOCK_EXHAUSTED_MESSAGE } from '@/lib/whatsapp-stock-exhausted';
vi.mock('@/lib/whatsapp.server', () => ({ gateway: vi.fn(), sendText: vi.fn(), sendTyping: vi.fn(), digits: (s: string) => s }));
vi.mock('@lovable.dev/ai-gateway', () => ({ generateResponse: vi.fn(), GatewayError: class GatewayError extends Error {} }));
import { generateResponse } from '@lovable.dev/ai-gateway';
import { processJobs } from '@/lib/whatsapp-automation.server';

function attendance(whatsappName: string | null = null, stockExhausted = false, circuitPaused = false, newAttendance = false) {
  let draft = conversationDraftSchema.parse({});
  let version = 0;
  let inbound = { body: '', wa_message_id: '', direction: 'in', kind: 'text', created_at: '' };
  let claim: unknown[] = [];
  let paused = false;
  let pauseReason: string | null = null;
  let confirmedAt: string | null = null;
  let attendanceStartedAt: string | null = null;
  let finished = false;
  const queued: { dedup_key: string; payload: { text?: string; summaryVersion?: number; summaryTotal?: number } }[] = [];
  const outbound: { body: string; created_at: string }[] = [];
  const requests: string[] = [];
  const db = {
    from(table: string) {
      let update: Record<string, unknown> | undefined;
      let direction = '';
      let body = '';
      let createdAfter = '';
      const q = {
        select: () => q, order: () => q, limit: () => q, like: () => q,
        gte: (field: string, value: string) => { if (field === 'created_at') createdAfter = value; return q; },
        eq: (field: string, value: string) => { if (field === 'direction') direction = value; if (field === 'body') body = value; return q; },
        update: (data: Record<string, unknown>) => { update = data; return q; },
        upsert: async (job: typeof queued[number]) => { if (!queued.some(j => j.dedup_key === job.dedup_key)) queued.push(job); return { data: null, error: null }; },
        single: async () => ({ error: null, data: table === 'whatsapp_settings'
          ? { business: { ...defaultBusiness, lunchProductId: 'm', pixKey: 'configured', stockExhausted, circuitPaused }, auto_reply_enabled: true, account_state: 'ok' }
          : table === 'pdv_state' ? { data: { products: [{ id: 'm', name: 'Marmita', price: 19.9, stock: null, active: true }] } }
          : { name: whatsappName, draft, draft_version: version, automation_paused: paused, automation_pause_reason: pauseReason, order_confirmed_at: confirmedAt, attendance_status: finished ? 'finished' : paused ? 'in_service' : 'new', assigned_to: null, last_inbound_at: inbound.created_at, attendance_started_at: attendanceStartedAt } }),
        then: (resolve: (value: unknown) => unknown) => {
          if (update?.['draft']) { draft = conversationDraftSchema.parse(update['draft']); version += 1; }
          if (update && 'automation_paused' in update) paused = Boolean(update['automation_paused']);
          if (update && 'automation_pause_reason' in update) pauseReason = update['automation_pause_reason'] as string | null;
          if (update && 'order_confirmed_at' in update) confirmedAt = update['order_confirmed_at'] as string | null;
          const messages = direction === 'out' ? outbound.filter(message => (!body || message.body === body) && (!createdAfter || Date.parse(message.created_at) >= Date.parse(createdAfter))) : [inbound];
          return Promise.resolve({ error: null, data: update ? [{ phone: 'test' }] : table === 'whatsapp_order_requests' ? [] : messages }).then(resolve);
        },
      };
      return q;
    },
    rpc: async (name: string) => {
      if (name === 'wa_claim_job') { const data = claim; claim = []; return { data, error: null }; }
      requests.push(name);
      return { data: name === 'wa_confirm_request' ? 'request-1' : 'order-1', error: null };
    },
  };
  return {
    queued, requests, draft: () => draft, paused: () => paused,
    pauseForConfirmedOrder(at: string) { paused = true; pauseReason = 'order_confirmed'; confirmedAt = at; },
    finish() { finished = true; paused = true; },
    async receive(text: string, time: string, id: string, kind = 'text') {
      vi.setSystemTime(new Date(`2026-11-16T${time}:00-03:00`));
      inbound = { body: text, wa_message_id: id, direction: 'in', kind, created_at: new Date().toISOString() };
      if (finished) { finished = false; paused = false; pauseReason = null; confirmedAt = null; attendanceStartedAt = null; draft = conversationDraftSchema.parse({}); }
      if (newAttendance && !attendanceStartedAt) attendanceStartedAt = inbound.created_at;
      claim = [{ id, phone: 'test', kind: 'interpret', dedup_key: `interpret:${id}`, payload: { inboundId: id, automatic: true } }];
      const before = queued.length;
      await processJobs(db as unknown as Parameters<typeof processJobs>[0], 1);
      for (const job of queued.slice(before)) if (job.payload.text) outbound.push({ body: job.payload.text, created_at: new Date().toISOString() });
    },
  };
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe('marmitas: atendimento por regras', () => {
  it('com estoque esgotado, avisa quem chamar uma única vez sem iniciar pedido', async () => {
    vi.useFakeTimers();
    const flow = attendance(null, true);
    await flow.receive('Bom dia', '11:00', 'sold-out-1');
    expect(flow.queued).toHaveLength(1);
    expect(flow.queued[0]?.payload.text).toBe(STOCK_EXHAUSTED_MESSAGE);
    await flow.receive('Quero 2 marmitas, meu nome é Maria, Rua A, 12, bairro Centro, Pix', '11:01', 'sold-out-2');
    expect(flow.queued).toHaveLength(1);
    expect(flow.requests).toEqual([]);
    expect(generateResponse).not.toHaveBeenCalled();
  });

  it('08h: abertura única, guarda dados, resumo antes da confirmação e um único aceite', async () => {
    vi.useFakeTimers();
    const flow = attendance(null, false, false, true);
    await flow.receive('Bom dia', '08:00', 'in-1');
    expect(flow.queued).toHaveLength(1);
    expect(flow.queued[0]?.payload.text).toBe(FIRST_CONTACT_MESSAGE);
    expect(flow.queued[0]?.dedup_key).toContain('first-contact:');
    await flow.receive('1', '08:01', 'in-2');
    expect(flow.draft().items).toEqual([{ productId: 'm', qty: 1, note: '' }]);
    await flow.receive('Meu nome é Maria, Rua A, 12, bairro Centro, Pix', '08:02', 'in-3');
    expect(flow.draft().summarySent).toBe(true);
    expect(flow.draft().quotedTotal).toBe(19.9);
    expect(flow.requests).toEqual([]);
    await flow.receive('Sim', '08:03', 'in-4');
    expect(flow.requests).toEqual(['wa_confirm_request']);
    expect(generateResponse).not.toHaveBeenCalled();
  });
  it('monta o rascunho durante bloqueio de envio sem confirmar resumo não enviado', async () => {
    vi.useFakeTimers();
    const flow = attendance(null, false, true);
    await flow.receive('Quero 1 marmita, meu nome é Maria, Rua A, 12, bairro Centro, Pix', '08:00', 'blocked-1');
    expect(flow.draft().items).toEqual([{ productId: 'm', qty: 1, note: '' }]);
    expect(flow.draft().summarySent).toBe(false);
    expect(flow.queued.at(-1)?.payload.summaryVersion).toBe(1);
    await flow.receive('Sim', '08:01', 'blocked-2');
    expect(flow.requests).not.toContain('wa_confirm_request');
  });

  it.each([{ text: '👍', kind: 'text' }, { text: '[imagem]', kind: 'image' }])('qualquer interação após o resumo confirma: $kind', async ({ text, kind }) => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Quero 1 marmita, meu nome é Maria, Rua A, 12, bairro Centro, Pix', '08:00', 'summary-1');
    expect(flow.draft().summarySent).toBe(true);
    expect(flow.requests).toEqual([]);
    await flow.receive(text, '08:01', 'interaction-1', kind);
    expect(flow.requests).toEqual(['wa_confirm_request']);
    expect(generateResponse).not.toHaveBeenCalled();
  });
  it('usa o perfil do WhatsApp no resumo quando o nome não foi informado', async () => {
    vi.useFakeTimers();
    const flow = attendance('Lurdes');
    await flow.receive('Quero 1 marmita, Rua do Comércio, 214, bairro Centauro, Pix', '11:00', 'profile-1');
    expect(flow.draft().customer).toBe('Lurdes');
    expect(flow.draft().summarySent).toBe(true);
    expect(flow.queued.at(-1)?.payload.text).toContain('Nome: Lurdes');
    expect(flow.queued.at(-1)?.payload.text).not.toContain('Ok Tbem');
  });
  it('não transforma Ok Tbem em nome quando não há perfil válido', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Quero 1 marmita, Rua do Comércio, 214, bairro Centauro, Pix', '11:00', 'chat-1');
    await flow.receive('Ok Tbem', '11:01', 'chat-2');
    expect(flow.draft().customer).toBe('');
    expect(flow.draft().summarySent).toBe(false);
    expect(flow.requests).toEqual([]);
  });
  it('não repete a abertura na passagem das 10h', async () => {
    vi.useFakeTimers();
    const flow = attendance(null, false, false, true);
    await flow.receive('Olá', '09:59', 'in-1');
    await flow.receive('Bom dia', '10:00', 'in-2');
    expect(flow.queued.filter(job => job.dedup_key.startsWith('first-contact:'))).toHaveLength(1);
    expect(flow.queued.filter(job => job.dedup_key.startsWith('campaign:'))).toHaveLength(0);
  });
  it('não repete a abertura nem o link ao receber outra saudação no mesmo atendimento', async () => {
    vi.useFakeTimers();
    const flow = attendance(null, false, false, true);
    await flow.receive('Bom dia', '08:30', 'in-1');
    await flow.receive('Olá', '08:31', 'in-2');
    expect(flow.queued.filter(job => job.payload.text === FIRST_CONTACT_MESSAGE)).toHaveLength(1);
    expect(flow.requests).toEqual([]);
  });
  it('usa a mesma abertura única das 10h às 14h20', async () => {
    vi.useFakeTimers();
    const flow = attendance(null, false, false, true);
    await flow.receive('Bom dia', '10:00', 'in-1');
    expect(flow.queued).toHaveLength(1);
    expect(flow.queued[0]?.payload.text).toBe(FIRST_CONTACT_MESSAGE);
    expect(generateResponse).not.toHaveBeenCalled();
  });
  it('reinicia a abertura somente quando um atendimento finalizado recebe nova mensagem', async () => {
    vi.useFakeTimers();
    const flow = attendance(null, false, false, true);
    await flow.receive('Bom dia', '08:30', 'attendance-1');
    await flow.receive('Olá', '08:31', 'attendance-2');
    flow.finish();
    await flow.receive('Bom dia', '08:32', 'attendance-3');
    expect(flow.queued.filter(job => job.payload.text === FIRST_CONTACT_MESSAGE)).toHaveLength(2);
  });
  it('não cria pedido de marmita às 14h20, mesmo com rascunho anterior', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Quero 2 marmitas, meu nome é Maria, Rua A, 12, bairro Centro, Pix', '14:19', 'in-1');
    expect(flow.draft().summarySent).toBe(true);
    await flow.receive('Sim', '14:20', 'in-2');
    expect(flow.requests).toEqual([]);
    expect(flow.draft().items[0]?.qty).toBe(2);
    expect(flow.queued.at(-1)?.payload.text).toBe(AFTERNOON_MESSAGES[1]);
  });
  it('à tarde envia horários e cardápio em sequência, sem repetir no mesmo período', async () => {
    vi.useFakeTimers();
    const flow = attendance(null, false, false, true);
    await flow.receive('Boa tarde', '15:30', 'afternoon-1');
    expect(flow.queued.map(job => job.payload.text)).toEqual([...AFTERNOON_MESSAGES]);
    expect(flow.queued.map(job => job.dedup_key)).toEqual([
      'campaign:2026-11-16T17:20:00.000Z:afternoon:0:test',
      'campaign:2026-11-16T17:20:00.000Z:afternoon:1:test',
    ]);
    await flow.receive('Olá', '15:31', 'afternoon-2');
    expect(flow.queued).toHaveLength(2);
    expect(flow.requests).toEqual([]);
    expect(generateResponse).not.toHaveBeenCalled();
  });
  it('apresenta a noite a partir das 17h, envia o cardápio após 18h e encerra às 22h10', async () => {
    vi.useFakeTimers();
    const night = attendance(null, false, false, true);
    await night.receive('Olá', '17:00', 'night-1');
    expect(night.queued[0]?.payload.text).toBe(NIGHT_MESSAGE);
    expect(night.queued[0]?.payload.text).not.toBe(FIRST_CONTACT_MESSAGE);
    const afterPreparationStarts = attendance(null, false, false, true);
    await afterPreparationStarts.receive('Boa noite', '18:00', 'night-after-18');
    expect(afterPreparationStarts.queued[0]?.payload.text).toBe(NIGHT_MENU_MESSAGE);
    expect(afterPreparationStarts.queued[0]?.payload.text).toContain('https://ultraconnectbrasa.com.br/cardapio');
    const hoursAfter18 = attendance();
    await hoursAfter18.receive('Que horas começa o preparo?', '19:22', 'night-hours-after-18');
    expect(hoursAfter18.queued[0]?.payload.text).toContain('https://ultraconnectbrasa.com.br/cardapio');
    expect(hoursAfter18.queued[0]?.payload.text).not.toContain('17:00');
    const closed = attendance();
    await closed.receive('Olá', '22:10', 'closed-1');
    expect(closed.queued[0]?.payload.text).toBe(CLOSING_MESSAGE);
  });
  it('transfere para atendente sem gerar resposta por IA ou pedido', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Quero falar com um atendente', '11:00', 'human-1');
    expect(flow.queued.some(j => j.payload.text === HANDOFF_MESSAGE)).toBe(false);
    expect(flow.requests).toEqual([]);
    expect(generateResponse).not.toHaveBeenCalled();
  });
  it('responde o prazo antes de continuar o atendimento', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Qual é o prazo de entrega?', '11:00', 'faq-1');
    expect(flow.queued).toHaveLength(1);
    expect(flow.queued[0]?.payload.text).toContain('30 a 45 minutos após o pedido sair');
    expect(flow.queued[0]?.payload.text).not.toContain('Não tenho um prazo');
  });
  it('não divulga quando não compreende e transfere pedidos humanos também à noite', async () => {
    vi.useFakeTimers();
    const unknown = attendance();
    await unknown.receive('Xyzz desconhecido', '08:30', 'unknown-1');
    expect(unknown.queued.some(j => j.payload.text === HANDOFF_MESSAGE)).toBe(false);
    expect(unknown.queued.some(job => job.dedup_key.startsWith('campaign:'))).toBe(false);
    const humanAtNight = attendance();
    await humanAtNight.receive('Quero falar com um atendente', '17:00', 'human-night-1');
    expect(humanAtNight.queued.some(j => j.payload.text === HANDOFF_MESSAGE)).toBe(false);
    expect(humanAtNight.queued[0]?.payload.text).not.toBe(NIGHT_MESSAGE);
  });
  it('depois da confirmação, não responde dúvidas nem agradecimentos do pedido anterior', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    flow.pauseForConfirmedOrder('2026-11-16T13:00:00.000Z');
    await flow.receive('Obrigada! Qual é o prazo de entrega?', '11:00', 'confirmed-followup-1');
    expect(flow.queued).toHaveLength(0);
    expect(flow.paused()).toBe(true);
    expect(flow.requests).toEqual([]);
  });
  it('depois da confirmação, uma saudação no mesmo período não reinicia o robô', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    flow.pauseForConfirmedOrder('2026-11-16T13:00:00.000Z');
    await flow.receive('Bom dia', '11:00', 'confirmed-greeting-1');
    expect(flow.queued).toHaveLength(0);
    expect(flow.paused()).toBe(true);
  });
  it('depois da confirmação, só uma nova compra explícita inicia outro fluxo', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    flow.pauseForConfirmedOrder('2026-11-16T13:00:00.000Z');
    await flow.receive('Quero fazer outro pedido', '11:05', 'confirmed-new-order-1');
    expect(flow.paused()).toBe(false);
    expect(flow.draft()).toEqual(conversationDraftSchema.parse({}));
    expect(flow.queued.length).toBeGreaterThan(0);
  });
});
