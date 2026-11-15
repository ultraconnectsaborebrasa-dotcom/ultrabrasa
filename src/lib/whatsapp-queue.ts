export type QueueConversation = {
  phone: string;
  attendance_status: string;
  awaiting_since: string | null;
  last_inbound_at: string | null;
  last_message_at: string;
};
export type QueueOrder = 'arrival' | 'recent';

export function needsStaffReply(conversation: QueueConversation) {
  return conversation.attendance_status === 'new' || conversation.attendance_status === 'needs_reply';
}

export function queueArrival(conversation: QueueConversation) {
  for (const value of [conversation.awaiting_since, conversation.last_inbound_at, conversation.last_message_at]) {
    const timestamp = value ? Date.parse(value) : NaN;
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

export function sortQueue<T extends QueueConversation>(conversations: T[], order: QueueOrder): T[] {
  return [...conversations].sort((a, b) => {
    if (order === 'recent') {
      return (Date.parse(b.last_message_at) || 0) - (Date.parse(a.last_message_at) || 0) || a.phone.localeCompare(b.phone);
    }
    const priority = Number(needsStaffReply(b)) - Number(needsStaffReply(a));
    return priority || queueArrival(a) - queueArrival(b) || a.phone.localeCompare(b.phone);
  });
}