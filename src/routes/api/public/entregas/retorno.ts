import { createFileRoute } from '@tanstack/react-router';
import { parseSignedDeliveryCallback } from '@/lib/delivery-callback-security';
import { externalDeliveryCallbackSchema } from '@/lib/delivery-integration';

export const Route = createFileRoute('/api/public/entregas/retorno')({
  server: {
    handlers: {
      GET: async () => {
        const configured = Boolean(process.env['ULTRABRASA_ENTREGAS_CALLBACK_SECRET']);
        return Response.json(configured ? { ok: true, code: 'health_ok' } : { ok: false, code: 'not_configured' }, { status: configured ? 200 : 503 });
      },
      POST: async ({ request }) => {
        const secret = process.env['ULTRABRASA_ENTREGAS_CALLBACK_SECRET'];
        if (!secret) return Response.json({ ok: false, code: 'not_configured' }, { status: 503 });
        const payload = await parseSignedDeliveryCallback(request, secret);
        if (!payload) return Response.json({ ok: false, code: 'invalid_signature' }, { status: 401 });
        if (typeof payload === 'object' && payload !== null) {
          const candidate = payload as Record<string, unknown>;
          if (candidate['event'] === 'test' || candidate['event'] === 'health' || candidate['type'] === 'test') {
            return Response.json({ ok: true, code: 'health_ok' });
          }
        }
        const parsed = externalDeliveryCallbackSchema.safeParse(payload);
        if (!parsed.success) return Response.json({ ok: false, code: 'invalid_callback' }, { status: 400 });
        const callback = parsed.data;
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const result = await supabaseAdmin.rpc('apply_external_delivery_callback', {
          p_event_id: callback.event_id,
          p_event: callback.event,
          p_revision: callback.revision,
          p_order_id: callback.order_id,
          p_delivery_id: callback.delivery_id,
          p_status: callback.status,
          p_occurred_at: callback.occurred_at,
          p_payload: callback,
        });
        if (result.error) return Response.json({ ok: false, code: 'processing_failed' }, { status: 500 });
        return Response.json({ ok: true, code: result.data });
      },
    },
  },
});
