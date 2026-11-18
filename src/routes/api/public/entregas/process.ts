import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
import { buildExternalDeliveryPayload } from '@/lib/delivery-integration';
import { sendSignedExternalDeliveryOrder } from '@/lib/delivery-integration-http';
import type { Order } from '@/lib/pdv-store';

export const Route = createFileRoute('/api/public/entregas/process')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const invalid = await authenticateCronRequest(request);
        if (invalid) return invalid;
        const secret = process.env['ULTRABRASA_ENTREGAS_ORDERS_SECRET'];
        if (!secret) return Response.json({ ok: false, code: 'not_configured' }, { status: 503 });
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const leased = await supabaseAdmin.rpc('lease_external_delivery_outbox', { p_limit: 3 });
        if (leased.error) return Response.json({ ok: false, code: 'lease_failed' }, { status: 500 });
        if (!leased.data.length) return Response.json({ ok: true, processed: 0, sent: 0, failed: 0 });
        const state = await supabaseAdmin.from('pdv_state').select('data').eq('id', 1).single();
        if (state.error) return Response.json({ ok: false, code: 'read_failed' }, { status: 500 });
        const orders = (state.data.data as { orders?: Order[] }).orders ?? [];
        let sent = 0;
        let failed = 0;
        await Promise.all(leased.data.map(async job => {
          let result: { ok: boolean; code: string };
          try {
            const order = orders.find(candidate => candidate.id === job.order_id);
            if (!order) result = { ok: false, code: 'order_not_found' };
            else result = await sendSignedExternalDeliveryOrder(buildExternalDeliveryPayload(order), secret);
          } catch {
            result = { ok: false, code: 'invalid_order' };
          }
          const completed = await supabaseAdmin.rpc('complete_external_delivery_outbox', {
            p_order_id: job.order_id,
            p_version: job.version,
            p_ok: result.ok,
            ...(result.ok ? {} : { p_error: result.code }),
          });
          if (completed.error || !result.ok) failed += 1;
          else sent += 1;
        }));
        return Response.json({ ok: failed === 0, processed: leased.data.length, sent, failed });
      },
    },
  },
});
