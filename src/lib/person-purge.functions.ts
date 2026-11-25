import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

import { finishCleanup } from './person-purge.server';

export const deletePersonPermanently = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ kind: z.enum(['customer', 'courier', 'staff']), id: z.string().uuid(), confirmation: z.literal('EXCLUIR') }).parse(input))
  .handler(async ({ data, context }) => {
    const allowed = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (allowed.error || !allowed.data) throw new Error('Somente o administrador pode excluir definitivamente.');
    const purged = await context.supabase.rpc('purge_person_history', { p_kind: data.kind, p_id: data.id, p_execute: true, p_confirmation: data.confirmation });
    if (purged.error) throw new Error(purged.error.message);
    const parsed = z.object({ cleanup_id: z.string().uuid() }).parse(purged.data);
    const completed = await finishCleanup(parsed.cleanup_id).catch(() => false);
    return { cleanupId: parsed.cleanup_id, completed };
  });

export const completePersonPurge = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ cleanupId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const allowed = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (allowed.error || !allowed.data) throw new Error('Sem permissão.');
    return { completed: await finishCleanup(data.cleanupId) };
  });