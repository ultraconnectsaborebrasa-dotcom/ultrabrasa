import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliveryPaymentDialog } from '@/components/pdv/DeliveryPaymentDialog';
import { DeliveryReceivablesPanel } from '@/components/pdv/DeliveryReceivablesPanel';
import type { DeliveryReceivables } from '@/lib/delivery-payment';

const mocks = vi.hoisted(() => ({ pay: vi.fn(), rpc: vi.fn(), refresh: vi.fn(), data: null as DeliveryReceivables | null }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: mocks.data, isPending: false, error: null }), useQueryClient: () => ({ invalidateQueries: mocks.refresh }) }));
vi.mock('@/lib/manual-payment', () => ({ submitManualPayment: mocks.pay }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));

beforeEach(() => {
  vi.clearAllMocks(); mocks.pay.mockResolvedValue(undefined); mocks.refresh.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.data = { methods: ['Dinheiro', 'Pix'], orders: [{ id: 'unassigned', number: 42, customer: 'Teste pendente', total: 39.8, status: 'Pronto para entrega', courier_id: null, courier_name: null, method: 'Pix', note: '', items: [{ name: 'Produto de teste', qty: 2, note: '' }] }] };
});
afterEach(cleanup);
describe('conferência manual de recebimento', () => {
  it('a loja mantém pendente quando não localiza o pagamento', async () => {
    const order = mocks.data?.orders[0];
    if (!order) throw new Error('Pedido de teste ausente');
    order.customer_paid_reported_at = '2026-11-25T22:45:00Z';
    render(<DeliveryPaymentDialog orderId="unassigned" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Não localizei o pagamento · manter a receber' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('reject_delivery_customer_paid', { p_order_id: 'unassigned' }));
    expect(mocks.pay).not.toHaveBeenCalled();
  });
  it('o relato do cliente enviado pelo motoboy não cria pagamento', async () => {
    render(<DeliveryPaymentDialog courier orderId="unassigned" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Cliente informou que já pagou/ }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('report_delivery_customer_paid', { p_order_id: 'unassigned' }));
    expect(mocks.pay).not.toHaveBeenCalled();
  });
  it('o motoboy não dá baixa enquanto a loja precisa conferir', () => {
    const order = mocks.data?.orders[0];
    if (!order) throw new Error('Pedido de teste ausente');
    order.customer_paid_reported_at = '2026-11-25T22:45:00Z';
    render(<DeliveryPaymentDialog courier orderId="unassigned" onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Confirmar que recebi e dar baixa' })).toBeNull();
    expect(mocks.pay).not.toHaveBeenCalled();
  });
  it('a loja pode conferir manualmente o relato e dar baixa', async () => {
    const order = mocks.data?.orders[0];
    if (!order) throw new Error('Pedido de teste ausente');
    order.customer_paid_reported_at = '2026-11-25T22:45:00Z';
    render(<DeliveryPaymentDialog orderId="unassigned" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar que recebi e dar baixa' }));
    await waitFor(() => expect(mocks.pay).toHaveBeenCalledWith('unassigned', 'Pix'));
  });
  it('não dá baixa ao abrir e só registra após confirmação com a forma efetivamente recebida', async () => {
    const onClose = vi.fn(); render(<DeliveryPaymentDialog orderId="unassigned" onClose={onClose} />);
    expect(mocks.pay).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Dinheiro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar que recebi e dar baixa' }));
    await waitFor(() => expect(mocks.pay).toHaveBeenCalledWith('unassigned', 'Dinheiro'));
    expect(mocks.pay).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith({ queryKey: ['courier-settlement'] }));
    expect(mocks.refresh).toHaveBeenCalledWith({ queryKey: ['delivery-board'] });
    expect(mocks.refresh).toHaveBeenCalledWith({ queryKey: ['delivery-receivables'] });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('permite procurar e receber um pedido mesmo sem entregador designado', () => {
    const { container } = render(<DeliveryReceivablesPanel date="2026-11-25" />);
    expect(container.querySelectorAll('article')).toHaveLength(0);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '42' } });
    expect(container.querySelectorAll('article')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Conferir pedido e receber' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.pay).not.toHaveBeenCalled();
  });
  it('não oferece baixa para pedido pago ou fora do acesso autorizado', () => {
    mocks.data = { methods: ['Pix'], orders: [] };
    render(<DeliveryPaymentDialog orderId="already-paid" onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Confirmar que recebi e dar baixa' })).not.toBeInTheDocument();
    expect(mocks.pay).not.toHaveBeenCalled();
  });
  it('mantém a conferência aberta se o pagamento falhar', async () => {
    mocks.pay.mockRejectedValue(new Error('Pagamento já registrado'));
    const onClose = vi.fn(); render(<DeliveryPaymentDialog orderId="unassigned" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar que recebi e dar baixa' }));
    await waitFor(() => expect(mocks.pay).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});