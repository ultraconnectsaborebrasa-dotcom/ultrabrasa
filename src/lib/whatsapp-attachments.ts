export const ATTACHMENT_ACK = 'Agradeçamos pelo anexo!';
export const ATTACHMENT_GROUP_MS = 60_000;

export function isAttachment(kind: string, mediaId?: string | null): boolean {
  return Boolean(mediaId) || ['image', 'document', 'video', 'audio', 'sticker', 'file'].includes(kind);
}

type Outbound = { body: string | null; created_at: string; status?: string | null };
export function hasRecentReply(messages: Outbound[], text: string, now = Date.now()): boolean {
  return messages.some(m => m.status !== 'failed' && m.status !== 'cancelled' &&
    m.body?.trim() === text.trim() && now - Date.parse(m.created_at) >= 0 &&
    now - Date.parse(m.created_at) < ATTACHMENT_GROUP_MS);
}