import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitManualPayment } from '@/lib/manual-payment';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

describe('baixa manual de pagamento', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset().mockResolvedValue({ data: null, error: null } as never);
  });

  it('mantém a baixa do caixa sem alterar a etapa', async () => {
    await submitManualPayment('pedido-1', 'Pix');
    expect(supabase.rpc).toHaveBeenCalledWith('pay_pdv_cashier', {
      order_id: 'pedido-1',
      payment_method: 'Pix',
    });
  });

  it('usa a baixa da cozinha que recebe e marca como pronto', async () => {
    await submitManualPayment('pedido-2', 'Dinheiro', true);
    expect(supabase.rpc).toHaveBeenCalledWith('pay_pdv_kitchen', {
      order_id: 'pedido-2',
      payment_method: 'Dinheiro',
    });
  });

  it('não informa sucesso quando a gravação falha', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('Falha na baixa') } as never);
    await expect(submitManualPayment('pedido-3', 'Cartão', true)).rejects.toThrow('Falha na baixa');
  });
});
