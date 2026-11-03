import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (error || !data) throw new Error('Somente o administrador pode usar o WhatsApp');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

export const whatsappStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    if (!process.env['WHATSAPP_API_KEY']) return { connected: false as const, reason: 'Não conectado' };
    const { gateway, recoverPending } = await import('@/lib/whatsapp.server');
    await recoverPending(db, 5);
    try {
      const p = await gateway('/phone_number?fields=display_phone_number,verified_name,quality_rating,is_on_biz_app');
      return { connected: true as const, phone: p.display_phone_number as string, name: p.verified_name as string | undefined, quality: p.quality_rating as string | undefined, coexistence: Boolean(p.is_on_biz_app) };
    } catch (e) {
      return { connected: false as const, reason: e instanceof Error ? e.message : 'Falha ao consultar' };
    }
  });

export const whatsappSend = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { phone: string; text: string; orderId?: string | null }) => {
    if (typeof i?.phone !== 'string' || typeof i?.text !== 'string' || !i.text.trim() || i.text.length > 4000) throw new Error('Mensagem inválida');
    return { phone: i.phone, text: i.text, orderId: typeof i.orderId === 'string' ? i.orderId.slice(0, 80) : null };
  })
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    const { sendText } = await import('@/lib/whatsapp.server');
    const id = await sendText(db, data.phone, data.text, { orderId: data.orderId, sentBy: context.userId });
    await db.from('whatsapp_conversations').update({ unread: 0 }).eq('phone', data.phone.replace(/\D/g, ''));
    return { id };
  });

export const whatsappSyncHistory = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { gateway } = await import('@/lib/whatsapp.server');
    const out: string[] = [];
    for (const sync_type of ['smb_app_state_sync', 'history']) {
      try { await gateway('/smb_app_data', { method: 'POST', body: { messaging_product: 'whatsapp', sync_type } }); out.push(`${sync_type}: ok`); }
      catch (e) { out.push(`${sync_type}: ${e instanceof Error ? e.message : 'erro'}`); }
    }
    return { results: out };
  });
