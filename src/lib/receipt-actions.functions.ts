import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const retryReceiptAnalysis = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const allowed = await context.supabase.rpc('wa_staff');
    if (allowed.error || !allowed.data) throw new Error('Sem permissão');
    const message = await context.supabase.from('whatsapp_messages').select('wa_message_id,phone,kind').eq('id', data.messageId).eq('direction', 'in').single();
    if (message.error || !message.data.wa_message_id || !['image','document'].includes(message.data.kind)) throw new Error('Selecione uma imagem ou PDF recebido');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { processReceipt } = await import('./payment-receipts.server');
    await processReceipt(supabaseAdmin, message.data.wa_message_id, true);
    return { ok: true };
  });

export const retryDepartureNotice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const allowed = await context.supabase.rpc('delivery_staff');
    if (allowed.error || !allowed.data) throw new Error('Sem permissão');
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const job = await db.from('whatsapp_jobs').select('*').eq('dedup_key', `departed:${data.orderId}`).single();
    if (job.error) throw new Error('Aviso não encontrado');
    const sent = await db.from('whatsapp_messages').select('id,status,wa_message_id').eq('reply_to', job.data.id).maybeSingle();
    if (sent.error) throw new Error(sent.error.message);
    if (sent.data?.status !== 'failed' && sent.data) throw new Error('Envio aceito ou desconhecido: confira antes de reenviar');
    if (!['failed','unknown'].includes(job.data.state)) throw new Error('O aviso já está enviado ou na fila');
    const conv = await db.from('whatsapp_conversations').select('last_inbound_at').eq('phone',job.data.phone).single();
    if (conv.error || !conv.data.last_inbound_at || Date.now()-Date.parse(conv.data.last_inbound_at)>=86400000) throw new Error('Fora da janela de 24h: aguarde uma mensagem do cliente');
    if (sent.data) {
      const released = await db.from('whatsapp_messages').update({reply_to:null}).eq('id',sent.data.id).eq('status','failed');
      if(released.error)throw new Error(released.error.message);
    }
    const queued = await db.from('whatsapp_jobs').update({state:'pending',processing_error:null,lease_until:null,next_attempt_at:new Date().toISOString()}).eq('id',job.data.id).eq('state',job.data.state);
    if(queued.error)throw new Error(queued.error.message);
    const { processJobs } = await import('./whatsapp-automation.server');
    await processJobs(db, 2);
    return {ok:true};
  });