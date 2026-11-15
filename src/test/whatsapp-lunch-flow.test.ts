import { afterEach, describe, expect, it, vi } from 'vitest';
import { conversationDraftSchema, defaultBusiness } from '@/lib/whatsapp-business';
import { NIGHT_MESSAGE, CLOSING_MESSAGE, LUNCH_CLOSED_MESSAGE, HANDOFF_MESSAGE } from '@/lib/whatsapp-rulebot';
vi.mock('@/lib/whatsapp.server', () => ({ gateway: vi.fn(), sendText: vi.fn(), sendTyping: vi.fn(), digits: (s: string) => s }));
vi.mock('@lovable.dev/ai-gateway', () => ({ generateResponse: vi.fn(), GatewayError: class GatewayError extends Error {} }));
import { generateResponse } from '@lovable.dev/ai-gateway';
import { processJobs } from '@/lib/whatsapp-automation.server';

function attendance() {
  let draft = conversationDraftSchema.parse({});
  let version = 0;
  let inbound = { body: '', wa_message_id: '', direction: 'in', kind: 'text', created_at: '' };
  let claim: unknown[] = [];
  const queued: { dedup_key: string; payload: { text?: string } }[] = [];
  const outbound: { body: string; created_at: string }[] = [];
  const requests: string[] = [];
  const db = {
    from(table: string) {
      let update: Record<string, unknown> | undefined;
      let direction = '';
      const q = {
        select: () => q, order: () => q, limit: () => q, gte: () => q, like: () => q,
        eq: (field: string, value: string) => { if (field === 'direction') direction = value; return q; },
        update: (data: Record<string, unknown>) => { update = data; return q; },
        upsert: async (job: typeof queued[number]) => { if (!queued.some(j => j.dedup_key === job.dedup_key)) queued.push(job); return { data: null, error: null }; },
        single: async () => ({ error: null, data: table === 'whatsapp_settings'
          ? { business: { ...defaultBusiness, lunchProductId: 'm', pixKey: 'configured' }, auto_reply_enabled: true, account_state: 'ok' }
          : table === 'pdv_state' ? { data: { products: [{ id: 'm', name: 'Marmita', price: 19.9, stock: null, active: true }] } }
          : { draft, draft_version: version, automation_paused: false, last_inbound_at: inbound.created_at } }),
        then: (resolve: (value: unknown) => unknown) => {
          if (update?.['draft']) { draft = conversationDraftSchema.parse(update['draft']); version += 1; }
          return Promise.resolve({ error: null, data: update ? [{ phone: 'test' }] : table === 'whatsapp_order_requests' ? [] : direction === 'out' ? outbound : [inbound] }).then(resolve);
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
    queued, requests, draft: () => draft,
    async receive(text: string, time: string, id: string, kind = 'text') {
      vi.setSystemTime(new Date(`2026-11-16T${time}:00-03:00`));
      inbound = { body: text, wa_message_id: id, direction: 'in', kind, created_at: new Date().toISOString() };
      claim = [{ id, phone: 'test', kind: 'interpret', dedup_key: `interpret:${id}`, payload: { inboundId: id, automatic: true } }];
      const before = queued.length;
      await processJobs(db as unknown as Parameters<typeof processJobs>[0], 1);
      for (const job of queued.slice(before)) if (job.payload.text) outbound.push({ body: job.payload.text, created_at: new Date().toISOString() });
    },
  };
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe('marmitas: atendimento por regras', () => {
  it('08h: uma promoção, guarda dados, resumo antes da confirmação e um único aceite', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Bom dia', '08:00', 'in-1');
    expect(flow.queued).toHaveLength(4);
    expect(new Set(flow.queued.map(job => job.dedup_key)).size).toBe(4);
    await flow.receive('1', '08:01', 'in-2');
    expect(flow.draft().items).toEqual([{ productId: 'm', qty: 1, note: '' }]);
    await flow.receive('Meu nome é Maria, Rua A, 12, bairro Centro, Pix', '08:02', 'in-3');
    expect(flow.draft().summarySent).toBe(true);
    expect(flow.draft().quotedTotal).toBe(19.9);
    expect(flow.requests).toEqual([]);
    await flow.receive('Sim', '08:03', 'in-4');
    expect(flow.requests).toEqual(['wa_confirm_request', 'wa_auto_accept_request']);
    expect(generateResponse).not.toHaveBeenCalled();
  });
  it.each([{ text: '👍', kind: 'text' }, { text: '[imagem]', kind: 'image' }])('qualquer interação após o resumo confirma: $kind', async ({ text, kind }) => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Quero 1 marmita, meu nome é Maria, Rua A, 12, bairro Centro, Pix', '08:00', 'summary-1');
    expect(flow.draft().summarySent).toBe(true);
    expect(flow.requests).toEqual([]);
    await flow.receive(text, '08:01', 'interaction-1', kind);
    expect(flow.requests).toEqual(['wa_confirm_request', 'wa_auto_accept_request']);
    expect(generateResponse).not.toHaveBeenCalled();
  });
  it('não repete a divulgação na passagem das 10h', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Olá', '09:59', 'in-1');
    await flow.receive('Bom dia', '10:00', 'in-2');
    expect(flow.queued.filter(job => job.dedup_key.startsWith('campaign:'))).toHaveLength(4);
  });
  it('não repete as partes ao receber outra saudação na mesma manhã', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Bom dia', '08:30', 'in-1');
    await flow.receive('Olá', '08:31', 'in-2');
    expect(flow.queued.filter(job => job.dedup_key.startsWith('campaign:'))).toHaveLength(4);
    expect(flow.requests).toEqual([]);
  });
  it('preserva a sequência normal das 10h às 14h20', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Bom dia', '10:00', 'in-1');
    expect(flow.queued.filter(job => job.dedup_key.startsWith('campaign:'))).toHaveLength(5);
    expect(generateResponse).not.toHaveBeenCalled();
  });
  it('não cria pedido de marmita às 14h20, mesmo com rascunho anterior', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Quero 2 marmitas, meu nome é Maria, Rua A, 12, bairro Centro, Pix', '14:19', 'in-1');
    expect(flow.draft().summarySent).toBe(true);
    await flow.receive('Sim', '14:20', 'in-2');
    expect(flow.requests).toEqual([]);
    expect(flow.draft().items[0]?.qty).toBe(2);
    expect(flow.queued.at(-1)?.payload.text).toBe(LUNCH_CLOSED_MESSAGE);
  });
  it('apresenta a noite a partir das 17h e encerra às 22h10', async () => {
    vi.useFakeTimers();
    const night = attendance();
    await night.receive('Olá', '17:00', 'night-1');
    expect(night.queued[0]?.payload.text).toBe(NIGHT_MESSAGE);
    const closed = attendance();
    await closed.receive('Olá', '22:10', 'closed-1');
    expect(closed.queued[0]?.payload.text).toBe(CLOSING_MESSAGE);
  });
  it('transfere para atendente sem gerar resposta por IA ou pedido', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Quero falar com um atendente', '11:00', 'human-1');
    expect(flow.queued[0]?.payload.text).toBe(HANDOFF_MESSAGE);
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
    expect(unknown.queued[0]?.payload.text).toBe(HANDOFF_MESSAGE);
    expect(unknown.queued.some(job => job.dedup_key.startsWith('campaign:'))).toBe(false);
    const humanAtNight = attendance();
    await humanAtNight.receive('Quero falar com um atendente', '17:00', 'human-night-1');
    expect(humanAtNight.queued[0]?.payload.text).toBe(HANDOFF_MESSAGE);
    expect(humanAtNight.queued[0]?.payload.text).not.toBe(NIGHT_MESSAGE);
  });
});