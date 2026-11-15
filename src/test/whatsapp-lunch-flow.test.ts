import { afterEach, describe, expect, it, vi } from 'vitest';
import { conversationDraftSchema, defaultBusiness } from '@/lib/whatsapp-business';
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
    async receive(text: string, time: string, id: string) {
      vi.setSystemTime(new Date(`2026-11-16T${time}:00-03:00`));
      inbound = { body: text, wa_message_id: id, direction: 'in', kind: 'text', created_at: new Date().toISOString() };
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
    expect(flow.queued).toHaveLength(1);
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
  it('não repete a divulgação na passagem das 10h', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Olá', '09:59', 'in-1');
    await flow.receive('Bom dia', '10:00', 'in-2');
    expect(flow.queued.filter(job => job.dedup_key.startsWith('campaign:'))).toHaveLength(1);
  });
  it('preserva a sequência normal das 10h às 14h20', async () => {
    vi.useFakeTimers();
    const flow = attendance();
    await flow.receive('Bom dia', '10:00', 'in-1');
    expect(flow.queued.filter(job => job.dedup_key.startsWith('campaign:'))).toHaveLength(3);
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
  });
});