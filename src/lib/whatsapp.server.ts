// Server-only WhatsApp helpers. Import only inside server handlers.
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/whatsapp';

function keys() {
  const lovable = process.env['LOVABLE_API_KEY'];
  const wa = process.env['WHATSAPP_API_KEY'];
  if (!lovable) throw new Error('LOVABLE_API_KEY não configurada');
  if (!wa) throw new Error('WhatsApp ainda não conectado');
  return { lovable, wa };
}

export async function gateway(path: string, init: { method?: string; body?: unknown } = {}) {
  const { lovable, wa } = keys();
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${lovable}`, 'X-Connection-Api-Key': wa, 'Content-Type': 'application/json' },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WhatsApp [${res.status}]: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

export const digits = (s: string) => s.replace(/\D/g, '');

/** Sends a text and records the outbound message. Returns the provider id. */
export async function sendText(db: Admin, phone: string, text: string, extra: { orderId?: string | null; sentBy?: string | null; source?: string; replyTo?: string | null } = {}) {
  const to = digits(phone);
  if (!/^[1-9]\d{9,14}$/.test(to)) throw new Error('Número inválido');
  const body = text.trim().slice(0, 4000);
  if (!body) throw new Error('Mensagem vazia');
  try {
    const r = await gateway('/messages', { method: 'POST', body: { messaging_product: 'whatsapp', to, type: 'text', text: { body } } });
    const waId: string | undefined = r?.messages?.[0]?.id;
    const ins = await db.from('whatsapp_messages').insert({ wa_message_id: waId ?? null, phone: to, direction: 'out', source: extra.source ?? 'pdv', body, status: 'accepted', order_id: extra.orderId ?? null, sent_by: extra.sentBy ?? null, reply_to: extra.replyTo ?? null });
    if (ins.error) throw new Error(ins.error.message);
    if (waId) await db.rpc('wa_reconcile', { _id: waId });
    await touchConversation(db, to, body, false);
    return waId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('whatsapp_messages').insert({ phone: to, direction: 'out', source: extra.source ?? 'pdv', body, status: 'failed', error: msg, failed_at: new Date().toISOString(), order_id: extra.orderId ?? null, sent_by: extra.sentBy ?? null, reply_to: extra.replyTo ?? null });
    throw e;
  }
}

async function touchConversation(db: Admin, phone: string, last: string, inbound: boolean, name?: string | null, at = new Date().toISOString()) {
  const cur = await db.from('whatsapp_conversations').select('unread,name').eq('phone', phone).maybeSingle();
  if (cur.error) throw new Error(cur.error.message);
  const row: Record<string, unknown> = { phone, last_message: last.slice(0, 200), last_message_at: at };
  if (name || cur.data?.name) row['name'] = name || cur.data?.name;
  if (inbound) { row['unread'] = (cur.data?.unread ?? 0) + 1; row['last_inbound_at'] = at; }
  const up = await db.from('whatsapp_conversations').upsert(row as never, { onConflict: 'phone' });
  if (up.error) throw new Error(up.error.message);
}

const tsOf = (t?: string | number) => (t ? new Date(Number(t) * 1000).toISOString() : new Date().toISOString());

function describe(m: any): { kind: string; body: string; media: string | null } {
  const t = m?.type ?? 'text';
  if (t === 'text') return { kind: 'text', body: m.text?.body ?? '', media: null };
  const media = m?.[t];
  if (media && typeof media === 'object' && 'id' in media) return { kind: t, body: media.caption ?? media.filename ?? `[${t}]`, media: media.id };
  if (t === 'reaction') return { kind: t, body: `Reagiu ${m.reaction?.emoji ?? ''}`, media: null };
  if (t === 'location') return { kind: t, body: `📍 ${m.location?.latitude},${m.location?.longitude}`, media: null };
  return { kind: t, body: `[${t}]`, media: null };
}

async function storeMessage(db: Admin, m: any, direction: 'in' | 'out', source: string, phone: string, name?: string | null) {
  if (!m?.id) return false;
  const d = describe(m);
  const at = tsOf(m.timestamp);
  const ins = await db.from('whatsapp_messages').upsert({ wa_message_id: m.id, phone, direction, source, kind: d.kind, body: d.body, media_id: d.media, status: direction === 'in' ? 'received' : 'sent', provider_at: at }, { onConflict: 'wa_message_id', ignoreDuplicates: true }).select('id');
  if (ins.error) throw new Error(ins.error.message);
  const isNew = (ins.data?.length ?? 0) > 0;
  if (isNew) await touchConversation(db, phone, d.body, direction === 'in' && source === 'customer', name, at);
  return isNew;
}

async function maybeAutoReply(db: Admin, phone: string, inboundId: string) {
  const s = await db.from('whatsapp_settings').select('auto_reply_enabled,auto_reply_text,account_state').eq('id', 1).single();
  if (s.error) throw new Error(s.error.message);
  if (!s.data.auto_reply_enabled || s.data.account_state !== 'ok') return;
  const done = await db.from('whatsapp_messages').select('id,status').eq('reply_to', inboundId).maybeSingle();
  if (done.error) throw new Error(done.error.message);
  if (done.data) return; // already attempted for this inbound message
  // At most one automatic reply per conversation every 12 hours.
  const since = new Date(Date.now() - 12 * 3600_000).toISOString();
  const claim = await db.from('whatsapp_conversations').update({ last_auto_reply_at: new Date().toISOString() }).eq('phone', phone).or(`last_auto_reply_at.is.null,last_auto_reply_at.lt.${since}`).select('phone');
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data?.length) return;
  try { await sendText(db, phone, s.data.auto_reply_text, { source: 'auto', replyTo: inboundId }); } catch (e) { console.error('auto reply failed', e); }
}

export async function processEvent(db: Admin, event: string, payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value ?? {};
  if (event === 'whatsapp.message') {
    const names = new Map<string, string>((value.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
    for (const m of value.messages ?? []) {
      const phone = digits(m.from ?? '');
      if (!phone) continue;
      await storeMessage(db, m, 'in', 'customer', phone, names.get(m.from));
      await maybeAutoReply(db, phone, m.id);
    }
  } else if (event === 'whatsapp.status') {
    for (const s of value.statuses ?? []) {
      const r = await db.rpc('wa_apply_status', { _id: s.id, _status: s.status, _at: tsOf(s.timestamp), _errors: s.errors ?? null });
      if (r.error) throw new Error(r.error.message);
    }
  } else if (event === 'whatsapp.smb_message_echoes') {
    for (const m of value.message_echoes ?? []) await storeMessage(db, m, 'out', 'phone', digits(m.to ?? ''));
  } else if (event === 'whatsapp.history') {
    for (const h of value.history ?? []) for (const t of h.threads ?? []) for (const m of t.messages ?? []) {
      const phone = digits(t.id ?? m.from ?? m.to ?? '');
      if (!phone) continue;
      const fromBusiness = m.from && digits(m.from) !== phone;
      await storeMessage(db, m, fromBusiness ? 'out' : 'in', 'history', phone);
    }
  } else if (event === 'whatsapp.smb_app_state_sync') {
    for (const s of value.state_sync ?? []) {
      const phone = digits(s.contact?.phone_number ?? '');
      if (!phone || s.action !== 'add') continue;
      const up = await db.from('whatsapp_conversations').upsert({ phone, name: s.contact?.full_name ?? null }, { onConflict: 'phone', ignoreDuplicates: false });
      if (up.error) throw new Error(up.error.message);
    }
  } else if (event === 'whatsapp.account_update') {
    const ev = value.event as string | undefined;
    const blocked = ['PARTNER_REMOVED', 'PARTNER_APP_UNINSTALLED', 'ACCOUNT_OFFBOARDED'].includes(ev ?? '') || (ev === 'DISABLED_UPDATE' && value.ban_info?.waba_ban_state === 'DISABLE');
    const state = blocked ? 'blocked' : ev === 'ACCOUNT_RECONNECTED' ? 'ok' : undefined;
    const r = await db.from('whatsapp_settings').update({ account_event: ev ?? null, ...(state ? { account_state: state } : {}), updated_at: new Date().toISOString() }).eq('id', 1);
    if (r.error) throw new Error(r.error.message);
  }
  // Other events stay stored in the inbox for reference.
}

export async function runEvent(db: Admin, row: { id: string; event: string; payload: unknown; attempts: number }) {
  try {
    await processEvent(db, row.event, row.payload);
    const r = await db.from('whatsapp_webhook_events').update({ processed_at: new Date().toISOString(), processing_error: null }).eq('id', row.id);
    if (r.error) throw new Error(r.error.message);
    return true;
  } catch (e) {
    const attempts = row.attempts + 1;
    await db.from('whatsapp_webhook_events').update({ attempts, processing_error: e instanceof Error ? e.message : String(e), next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** attempts) * 1000).toISOString() }).eq('id', row.id);
    return false;
  }
}

/** Retries a few unfinished events whose backoff expired (fair: ordered by next attempt). */
export async function recoverPending(db: Admin, limit = 5) {
  const p = await db.from('whatsapp_webhook_events').select('id,event,payload,attempts').is('processed_at', null).lte('next_attempt_at', new Date().toISOString()).order('next_attempt_at').limit(limit);
  if (p.error) return;
  for (const row of p.data) await runEvent(db, row);
}
