import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const flushCourierPush = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [{ data: admin }, { data: cashier }] = await Promise.all([
    context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' }),
    context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'cashier' }),
  ]);
  if (!admin && !cashier) throw new Error('Sem permissão');
  const { processCourierPush } = await import('./courier-push.server');
  await processCourierPush();
});