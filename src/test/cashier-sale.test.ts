import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitCashierSale } from '@/lib/cashier-sale';
import { supabase } from '@/integrations/supabase/client';
import { canDirectSale } from '@/lib/pdv-sale';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

const request = {
  id: 'pedido-teste',
  type: 'Balcão',
  items: [{ productId: 'marmita', qty: 1, note: '' }],
};

describe('envio de venda pelo caixa', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset().mockResolvedValue({ data: { number: 900, id: 'pedido-teste' }, error: null } as never);
  });

  it('mantém o envio sem pagamento na gravação existente', async () => {
    await submitCashierSale(request);
    expect(supabase.rpc).toHaveBeenCalledWith('submit_pdv_operator_with_contact', { request });
  });

  it('usa uma única gravação para criar e quitar o pedido pago', async () => {
    await submitCashierSale(request, 'Pix');
    expect(supabase.rpc).toHaveBeenCalledWith('submit_pdv_cashier_paid', {
      request,
      payment_method: 'Pix',
    });
  });

  it('grava a venda direta paga sem usar o envio à cozinha', async () => {
    await submitCashierSale(request, 'Pix', 'direct');
    expect(supabase.rpc).toHaveBeenCalledWith('submit_pdv_cashier_direct_paid', {
      request,
      payment_method: 'Pix',
    });
  });

  it('permite receber Delivery na mesma gravação, deixando o pedido pago para entrega', async () => {
    expect(canDirectSale('Delivery')).toBe(true);
    expect(canDirectSale('Balcão')).toBe(true);
    await submitCashierSale({ ...request, type: 'Delivery' }, 'Pix', 'direct');
    expect(supabase.rpc).toHaveBeenCalledWith('submit_pdv_cashier_direct_paid', {
      request: { ...request, type: 'Delivery' },
      payment_method: 'Pix',
    });
  });

  it('não permite venda direta sem forma de pagamento', async () => {
    await expect(submitCashierSale(request, undefined, 'direct')).rejects.toThrow('Selecione a forma de pagamento');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('não informa sucesso quando a gravação paga falha', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('Sem caixa aberto') } as never);
    await expect(submitCashierSale(request, 'Dinheiro')).rejects.toThrow('Sem caixa aberto');
  });
});
