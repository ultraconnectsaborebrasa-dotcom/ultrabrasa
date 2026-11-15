import { describe, it, expect, vi } from 'vitest';
import { isAttachment, hasRecentReply, ATTACHMENT_ACK } from '@/lib/whatsapp-attachments';
import { processEvent } from '@/lib/whatsapp.server';

const { queueJob } = vi.hoisted(() => ({ queueJob: vi.fn() }));
vi.mock('@/lib/whatsapp-automation.server', () => ({ queueJob }));

function attachmentDb(summarySent: boolean) {
  return {
    rpc: vi.fn().mockResolvedValue({data:true,error:null}),
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        single: async () => ({ data: table === 'whatsapp_conversations' ? { draft: { summarySent } } : { auto_reply_enabled: true, account_state: 'ok' }, error: null }),
      };
      return q;
    },
  } as unknown as Parameters<typeof processEvent>[0];
}

describe('Attachment acknowledgment rules', () => {
  it('uses the single predefined acknowledgment', () => {
    expect(ATTACHMENT_ACK).toBe('Agradeçamos pelo anexo!');
  });
  it.each(['image', 'document', 'video', 'audio', 'sticker', 'file'])('acknowledges %s attachments', kind => {
    expect(isAttachment(kind)).toBe(true);
  });
  it('acknowledges unknown file types carrying a media id', () => expect(isAttachment('custom', '123')).toBe(true));
  it('does not treat ordinary messages or reactions as attachments', () => {
    expect(isAttachment('text')).toBe(false);
    expect(isAttachment('reaction')).toBe(false);
  });
  it('suppresses nearby identical acknowledgments regardless of author', () => {
    expect(hasRecentReply([{body:'recebido', created_at:'2026-11-15T02:48:00Z', status:'accepted'}], 'recebido', Date.parse('2026-11-15T02:48:20Z'))).toBe(true);
  });
  it('does not mistake known failed sends for confirmations', () => {
    expect(hasRecentReply([{body:'recebido', created_at:'2026-11-15T02:48:00Z', status:'failed'}], 'recebido', Date.parse('2026-11-15T02:48:20Z'))).toBe(false);
  });
  it('permits a new acknowledgment outside the short burst', () => {
    expect(hasRecentReply([{body:'recebido', created_at:'2026-11-15T02:48:00Z'}], 'recebido', Date.parse('2026-11-15T02:50:00Z'))).toBe(false);
  });
  it('replayed events retain the same inbound deduplication key and do not confirm before a summary', async () => {
    queueJob.mockClear();
    const db = attachmentDb(false);
    const payload = {entry:[{changes:[{value:{messages:[{id:'wamid.file',from:'5573999999999',type:'document',document:{id:'123',filename:'pedido.xlsx'}}]}}]}]};
    await processEvent(db, 'whatsapp.message', payload);
    await processEvent(db, 'whatsapp.message', payload);
    const ackCalls = queueJob.mock.calls.filter(c => c[1] === 'attachment-ack:wamid.file');
    expect(ackCalls).toHaveLength(2);
    expect(new Set(ackCalls.map(c => c[1])).size).toBe(1);
    expect(ackCalls[0]?.[4]).toMatchObject({automatic:true,inboundId:'wamid.file'});
    expect(queueJob.mock.calls.some(c => c[3] === 'interpret')).toBe(false);
  });
  it('queues an attachment as order confirmation only after the summary', async () => {
    queueJob.mockClear();
    const db = attachmentDb(true);
    const payload = {entry:[{changes:[{value:{messages:[{id:'wamid.image',from:'5573999999999',type:'image',image:{id:'123'}}]}}]}]};
    await processEvent(db, 'whatsapp.message', payload);
    expect(queueJob.mock.calls.some(c => c[1] === 'attachment-ack:wamid.image')).toBe(true);
    expect(queueJob.mock.calls.some(c => c[1] === 'interpret:wamid.image' && c[3] === 'interpret')).toBe(true);
  });
});