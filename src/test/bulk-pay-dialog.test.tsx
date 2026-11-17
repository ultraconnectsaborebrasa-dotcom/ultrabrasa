import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BulkPayDialog } from '@/components/pdv/BulkPayDialog';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

describe('baixa em lote no caixa', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset().mockResolvedValue({ data: null, error: null } as never);
  });

  it('aciona a impressão de cada pedido pago com a forma escolhida', async () => {
    const onPaid = vi.fn();
    render(
      <BulkPayDialog
        orders={[{ id: 'pedido-1', number: 1, total: 19.9 }, { id: 'pedido-2', number: 2, total: 39.8 }]}
        methods={['Pix', 'Dinheiro']}
        onClose={() => undefined}
        onDone={() => undefined}
        onPaid={onPaid}
      />,
    );

    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'Dinheiro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar baixa de todos' }));

    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(2));
    expect(onPaid).toHaveBeenNthCalledWith(1, 'pedido-1', 'Dinheiro');
    expect(onPaid).toHaveBeenNthCalledWith(2, 'pedido-2', 'Dinheiro');
  });
});
