import { describe, expect, it } from 'vitest';
import { needsStaffReply, sortQueue, type QueueConversation } from '@/lib/whatsapp-queue';

const conversation = (phone: string, hour: string, extra: Partial<QueueConversation> = {}): QueueConversation => ({
  phone, attendance_status: 'new', awaiting_since: `2026-11-15T${hour}:00Z`,
  last_inbound_at: `2026-11-15T${hour}:00Z`, last_message_at: `2026-11-15T${hour}:00Z`, ...extra,
});

describe('WhatsApp arrival queue', () => {
  it('serves the oldest arrival first even after a newer automatic message', () => {
    const rows = [conversation('2', '12:05'), conversation('1', '12:00', { last_message_at: '2026-11-15T12:10:00Z' })];
    expect(sortQueue(rows, 'arrival').map(c => c.phone)).toEqual(['1', '2']);
    expect(rows.map(c => c.phone)).toEqual(['2', '1']);
  });
  it('puts customers awaiting a reply ahead of conversations already answered', () => {
    expect(sortQueue([conversation('1', '11:00', { attendance_status: 'in_service' }), conversation('2', '12:00', { attendance_status: 'needs_reply' })], 'arrival').map(c => c.phone)).toEqual(['2', '1']);
  });
  it('keeps a read customer waiting until an actual attendance change', () => {
    expect(needsStaffReply(conversation('1', '12:00'))).toBe(true);
    expect(needsStaffReply(conversation('2', '12:00', { attendance_status: 'finished' }))).toBe(false);
  });
  it('puts the newest conversations first and older days below', () => {
    expect(sortQueue([conversation('1', '12:00'), conversation('2', '12:05')], 'recent').map(c => c.phone)).toEqual(['2', '1']);
    const today = conversation('hoje', '12:00');
    const previousDay = conversation('anterior', '12:00', { last_message_at: '2026-11-14T12:00:00Z', awaiting_since: '2026-11-14T12:00:00Z', last_inbound_at: '2026-11-14T12:00:00Z' });
    expect(sortQueue([previousDay, today], 'recent').map(c => c.phone)).toEqual(['hoje', 'anterior']);
  });
  it('uses inbound time when the waiting timestamp is absent or invalid', () => {
    expect(sortQueue([conversation('2', '12:05', { awaiting_since: null }), conversation('1', '12:00', { awaiting_since: 'invalid' })], 'arrival').map(c => c.phone)).toEqual(['1', '2']);
  });
});