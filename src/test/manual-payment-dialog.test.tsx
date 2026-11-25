import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ManualPaymentDialog } from '@/components/pdv/ManualPaymentDialog';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

describe('janela de recebimento na cozinha', () => {
  it('aplica desconto e acréscimo junto com o pagamento', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    render(<ManualPaymentDialog order={{id:'pedido-ajuste',number:1,total:39.8}} methods={['Dinheiro']} onClose={vi.fn()} onPaid={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText('Desconto em reais'),{target:{value:'5'}});
    fireEvent.change(screen.getByLabelText('Acréscimo em reais'),{target:{value:'2'}});
    fireEvent.change(screen.getByLabelText('Forma de pagamento'),{target:{value:'Dinheiro'}});
    fireEvent.click(screen.getByRole('button',{name:'Confirmar baixa'}));
    await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledWith('pay_pdv_adjusted',{p_order:'pedido-ajuste',p_method:'Dinheiro',p_discount:5,p_extra:2,p_mark_ready:false}));
  });
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
    fireEvent.click(screen.getByRole('button', { name: 'Receber e dar baixa' }));

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('pay_pdv_kitchen', {
      order_id: 'pedido-cozinha',
      payment_method: 'Pix',
    }));
    expect(onPaid).toHaveBeenCalledWith('Pix');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
