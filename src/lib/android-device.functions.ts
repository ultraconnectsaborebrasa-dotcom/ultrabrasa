import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { newPairCode, sha256 } from '@/lib/android-device';

export const createAndroidDevicePair = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const code = newPairCode();
    const { error } = await context.supabase.rpc('create_courier_device_pair', { p_code_hash: await sha256(code) });
    if (error) throw new Error(error.message);
    return { code, expiresAt: Date.now() + 5 * 60 * 1000 };
  });