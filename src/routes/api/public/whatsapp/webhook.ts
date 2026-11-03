import { createFileRoute } from '@tanstack/react-router';
import { verifyWebhookRequest } from '@lovable.dev/webhooks-js';

export const Route = createFileRoute('/api/public/whatsapp/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env['WHATSAPP_API_KEY'];
        if (!secret) return new Response('not configured', { status: 503 });
        let payload: unknown;
        try {
          ({ payload } = await verifyWebhookRequest({ req: request, secret, maxBodyBytes: 4 * 1024 * 1024 }));
        } catch {
          return new Response('invalid signature', { status: 401 });
        }
        const deliveryId = request.headers.get('X-Lovable-Delivery')?.trim();
        const event = request.headers.get('X-Lovable-Event')?.trim();
        if (!deliveryId || !event) return new Response('missing headers', { status: 400 });
        const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
        const { runEvent, recoverPending } = await import('@/lib/whatsapp.server');
        const ins = await db.from('whatsapp_webhook_events').upsert({ delivery_id: deliveryId, event, payload: payload as never }, { onConflict: 'delivery_id', ignoreDuplicates: true });
        if (ins.error) return new Response('store failed', { status: 500 });
        const row = await db.from('whatsapp_webhook_events').select('id,event,payload,attempts,processed_at').eq('delivery_id', deliveryId).single();
        if (row.error) return new Response('read failed', { status: 500 });
        if (!row.data.processed_at) {
          const ok = await runEvent(db, row.data);
          if (!ok) return new Response('processing failed', { status: 500 });
        }
        await recoverPending(db, 3);
        await runAfterResponse(request, 'WhatsApp processing', async () => {
          const { processJobs } = await import('@/lib/whatsapp-automation.server');
          await processJobs(db, 4);
        });
        return new Response('ok');
      },
    },
  },
});
