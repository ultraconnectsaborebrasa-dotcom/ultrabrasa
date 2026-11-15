import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@lovable.dev/ai-gateway', () => ({ generateResponse: vi.fn() }));
vi.mock('@/lib/whatsapp.server', () => ({ downloadWhatsAppMedia: vi.fn() }));
import { generateResponse } from '@lovable.dev/ai-gateway';
import { downloadWhatsAppMedia } from '@/lib/whatsapp.server';
import { processReceipt } from '@/lib/payment-receipts.server';

function database(existing: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: 'receipt-1', error: null });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn();
  const from = vi.fn((table: string) => {
    const result = { data: table === 'whatsapp_order_requests'
      ? [{ id: 'request-1', order_id: 'order-1', quoted_total: 19.9, status: 'accepted', created_at: '2026-11-15T12:00:00Z', request: { payment: 'Pix' } }]
      : [], error: null };
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain), gte: vi.fn(() => chain), neq: vi.fn(() => chain), update,
      single: vi.fn().mockResolvedValue({ data: table === 'whatsapp_messages'
        ? { id: 'message-1', phone: '5573000000000', media_id: 'media-1' }
        : table === 'pdv_state' ? { data: { orders: [{ id: 'order-1', status: 'cozinha', payments: [] }] } }
        : { state: 'review', request_id: 'request-1', order_id: 'order-1', storage_path: 'message-1.pdf' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
      limit: vi.fn().mockResolvedValue(result),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  });
  const db = { from, rpc, storage: { from: vi.fn(() => ({ upload })) } };
  return { db: db as unknown as Parameters<typeof processReceipt>[0], rpc, upload, update };
}

describe('manual receipt attachment processing', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(downloadWhatsAppMedia).mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), mime: 'application/pdf' }); });
  it('stores the PDF privately without calling AI', async () => {
    const { db, upload } = database();
    await processReceipt(db, 'wamid.in');
    expect(upload).toHaveBeenCalledWith('message-1.pdf', new Uint8Array([1, 2, 3]), { contentType: 'application/pdf', upsert: true });
    expect(generateResponse).not.toHaveBeenCalled();
  });
  it('links the order without extracting an amount or recording payment', async () => {
    const { db, rpc, update } = database();
    await processReceipt(db, 'wamid.in');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('record_payment_receipt_input', { _input: expect.objectContaining({ request: 'request-1', compatible: false, evidence: { isPixReceipt: false, state: 'unknown', amount: null, recipient: null, pixKey: null, paidDate: null, transactionId: null } }) });
    expect(update).not.toHaveBeenCalled();
  });
  it('does not duplicate an existing receipt', async () => {
    const { db, rpc } = database({ id: 'receipt-1', state: 'review' });
    await processReceipt(db, 'wamid.in');
    expect(downloadWhatsAppMedia).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('file recovery also never calls AI or records payment', async () => {
    const { db, rpc } = database();
    await processReceipt(db, 'wamid.in', true);
    expect(generateResponse).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['record_payment_receipt_input']);
  });
});