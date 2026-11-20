import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OrdersView } from '@/components/pdv/Views';
import { setState, type Order } from '@/lib/pdv-store';

const { openCloud, printOrder, rpc } = vi.hoisted(() => ({
  openCloud: vi.fn(), printOrder: vi.fn(), rpc: vi.fn(),
}));
vi.mock('@/lib/pdv-cloud', () => ({ openCloud }));
vi.mock('@/services/thermalPrinter', () => ({ printOrder }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/components/pdv/ReceiptReview', () => ({ ReceiptReview: () => null }));
vi.mock('@/components/pdv/SalesHistory', () => ({ SalesHistory: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const pendingOrder: Order = {
  id: 'pedido-receber', number: 4, type: 'Balcão', customer: 'Cliente balcão', status: 'pronto',
  createdAt: 123, note: '', discount: 0, fee: 0, serviceFee: false, paymentStatus: 'pendente',
  items: [{ uid: 'item-1', productId: 'marmita', name: 'Marmita completa', qty: 1, price: 19.9, note: '' }],
  payments: [],
};

describe('baixa na aba Receber', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: null, error: null });
    openCloud.mockReset().mockResolvedValue(undefined);
    printOrder.mockReset();
    setState(state => ({
      ...state,
      orders: [pendingOrder],
      cash: { ...state.cash, open: true },
      settings: { ...state.settings, paymentMethods: ['Pix', 'Dinheiro'], serviceFeePct: 0 },
    }));
  });

  afterEach(() => {
    cleanup();
    setState(state => ({ ...state, orders: [], cash: { ...state.cash, open: false } }));
  });

  it('registra pagamento Pix sem acionar a impressora', async () => {
    render(<OrdersView admin goSell={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dar baixa' }));
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'Pix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Receber e dar baixa' }));

    await waitFor(() => expect(openCloud).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('pay_pdv_kitchen', { order_id: 'pedido-receber', payment_method: 'Pix' });
    expect(printOrder).not.toHaveBeenCalled();
  });
});
