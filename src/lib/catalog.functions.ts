import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { PublicCatalog } from './catalog';

export const getPublicCatalog = createServerFn({ method: 'GET' }).handler(async (): Promise<PublicCatalog> => {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  const client = createClient<Database>(process.env['SUPABASE_URL']!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { fetch: (input, init) => {
      const h = new Headers(init?.headers);
      if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization');
      h.set('apikey', key);
      return fetch(input, { ...init, headers: h });
    } },
  });
  const { data, error } = await client.rpc('read_public_catalog');
  if (error) throw new Error('Não foi possível carregar o cardápio');
  return data as unknown as PublicCatalog;
});
