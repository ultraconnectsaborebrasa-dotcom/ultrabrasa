import { describe, expect, it, vi } from 'vitest';
import { updateWhatsappAutoReply } from '@/lib/whatsapp-robot-toggle.functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

function contextWith(rpc: ReturnType<typeof vi.fn>) {
  return { supabase: { rpc } as unknown as SupabaseClient<Database> };
}

describe('controle global do robô', () => {
  it('desliga pela função autorizada e confirma o estado salvo', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });

    await expect(updateWhatsappAutoReply(contextWith(rpc), false)).resolves.toEqual({ enabled: false });
    expect(rpc).toHaveBeenNthCalledWith(1, 'wa_staff');
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_whatsapp_auto_reply', { _enabled: false });
  });

  it('não altera o robô quando o usuário não é Administrador ou Caixa', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });

    await expect(updateWhatsappAutoReply(contextWith(rpc), true)).rejects.toThrow('Sem permissão para alterar o robô');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('wa_staff');
  });
});
