import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type WhatsappContext = { supabase: SupabaseClient<Database> };

export async function updateWhatsappAutoReply(context: WhatsappContext, enabled: boolean) {
  const permission = await context.supabase.rpc('wa_staff');
  if (permission.error || !permission.data) throw new Error('Sem permissão para alterar o robô');

  const result = await context.supabase.rpc('set_whatsapp_auto_reply' as never, { _enabled: enabled } as never);
  if (result.error) throw new Error(result.error.message);
  return { enabled };
}

export async function updateWhatsappStockExhausted(context: WhatsappContext, enabled: boolean) {
  const permission = await context.supabase.rpc('wa_staff');
  if (permission.error || !permission.data) throw new Error('Sem permissão para alterar o aviso de estoque');

  const result = await context.supabase.rpc('set_whatsapp_stock_exhausted', { _enabled: enabled });
  if (result.error) throw new Error(result.error.message);
  return { stockExhausted: enabled };
}

export const whatsappSetAutoReply = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => updateWhatsappAutoReply(context, data.enabled));

export const whatsappSetStockExhausted = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => updateWhatsappStockExhausted(context, data.enabled));
