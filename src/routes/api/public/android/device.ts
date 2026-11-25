import { createFileRoute } from '@tanstack/react-router';
import { androidExchangeInput, androidPairInput, deviceBearer, sha256 } from '@/lib/android-device';

export const Route = createFileRoute('/api/public/android/device')({
  server: { handlers: { POST: async ({ request }) => {
    const headers = { 'Cache-Control': 'no-store' };
    if (Number(request.headers.get('Content-Length')) > 8192) return Response.json({ error: 'Solicitação muito grande' }, { status: 413, headers });
    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > 8192) return Response.json({ error: 'Solicitação muito grande' }, { status: 413, headers });
      body = JSON.parse(text);
    } catch { return Response.json({ error: 'Solicitação inválida' }, { status: 400, headers }); }
    const pair = androidPairInput.safeParse(body);
    if (pair.success) {
      // A 128-bit one-use capability is verified atomically by the scoped RPC.
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { data, error } = await supabaseAdmin.rpc('bind_courier_android_device', {
        p_code_hash: await sha256(pair.data.code), p_secret_hash: await sha256(pair.data.secret),
        ...(pair.data.fcmToken ? { p_fcm_token: pair.data.fcmToken } : {}),
      });
      if (error) return Response.json({ error: 'Código inválido, utilizado ou expirado; gere outro na sua conta.' }, { status: 401, headers });
      return Response.json(data, { headers });
    }
    const secret = deviceBearer(request.headers.get('Authorization'));
    if (!secret) return Response.json({ error: 'Aparelho sem autorização' }, { status: 401, headers });
    const parsed = androidExchangeInput.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Localização ou ação inválida' }, { status: 400, headers });
    // Device credentials grant GPS only, never the user's general session.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const value = parsed.data;
    if (value.action === 'push-token') {
      const { error } = await supabaseAdmin.rpc('register_courier_push_token', { p_secret_hash: await sha256(secret), p_token: value.token });
      return Response.json(error ? { error: 'Aparelho sem autorização' } : { registered: true }, { status: error ? 401 : 200, headers });
    }
    const { data, error } = await supabaseAdmin.rpc('courier_android_exchange', {
      p_secret_hash: await sha256(secret), p_action: value.action,
      ...(value.action === 'location' ? { p_latitude: value.latitude, p_longitude: value.longitude, p_accuracy: value.accuracy, p_observed_at: value.observedAt } : {}),
    });
    if (error) return Response.json({ error: error.message === 'Localização inválida ou antiga' ? error.message : 'Aparelho sem autorização; vincule novamente.' }, { status: error.message === 'Localização inválida ou antiga' ? 400 : 401, headers });
    return Response.json(data, { headers });
  } } },
});