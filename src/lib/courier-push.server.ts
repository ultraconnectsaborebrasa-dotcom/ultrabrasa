import { courierPushMessage } from './courier-push';

export async function processCourierPush() {
  const key = process.env['LOVABLE_API_KEY'];
  const connection = process.env['FIREBASE_MESSAGING_API_KEY'];
  if (!key || !connection) return;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const leased = await supabaseAdmin.rpc('lease_courier_push_jobs');
  if (leased.error) throw new Error(leased.error.message);
  await Promise.all(leased.data.map(async job => {
    let state = 'unknown';
    let error: string | null = null;
    try {
      const response = await fetch('https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': connection, 'Content-Type': 'application/json' },
        body: JSON.stringify(courierPushMessage(job.token, job.job_id)), signal: AbortSignal.timeout(12000),
      });
      if (response.ok) state = 'sent';
      else {
        const body = await response.text();
        // Never log a registration token or the provider's potentially sensitive response.
        error = `Firebase ${response.status}`;
        state = response.status === 429 || response.status >= 500 ? 'pending' : 'failed';
        if (body.includes('UNREGISTERED')) await supabaseAdmin.from('courier_android_devices').update({ fcm_token: null }).eq('id', job.device_id).eq('fcm_token', job.token);
        console.error('Courier push failed', error);
      }
    } catch { error = 'Envio sem confirmação; não reenviar automaticamente'; }
    const saved = await supabaseAdmin.from('courier_push_jobs').update({ state, error }).eq('id', job.job_id).eq('state', 'sending');
    if (saved.error) console.error('Courier push state could not be saved');
  }));
}