import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ManualPaymentDialog } from '@/components/pdv/ManualPaymentDialog';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

describe('janela de recebimento na cozinha', () => {
  it('recebe e marca o pedido em preparo como pronto', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    const onPaid = vi.fn();
    const onClose = vi.fn();
    render(
      <ManualPaymentDialog
        order={{ id: 'pedido-cozinha', number: 901, total: 19.9 }}
        methods={['Pix', 'Dinheiro']}
        markReady
        onPaid={onPaid}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'Pix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Receber e marcar pronto' }));

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('pay_pdv_kitchen', {
      order_id: 'pedido-cozinha',
      payment_method: 'Pix',
    }));
    expect(onPaid).toHaveBeenCalledWith('Pix');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
