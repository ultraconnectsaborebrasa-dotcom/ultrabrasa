import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeliveryReceivablesPanel } from '@/components/pdv/DeliveryReceivablesPanel';

vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({
  data: { orders: [
    { id: 'morning', number: 1, customer: 'Cliente da manhã', total: 40, status: 'Pronto para entrega' },
    { id: 'night', number: 2, customer: 'Cliente da noite', total: 25, status: 'Pronto para entrega' },
    { id: 'unassigned', number: 3, customer: 'Cliente sem designação', total: 19.9, status: 'Pronto para entrega' },
  ] }, isPending: false, error: null,
}) }));
vi.mock('@/lib/delivery-payment', () => ({ deliveryReceivablesQuery: vi.fn() }));
vi.mock('@/components/pdv/DeliveryPaymentDialog', () => ({ DeliveryPaymentDialog: () => null }));
afterEach(cleanup);
describe('recebimentos separados por turno', () => {
  it('não mostra pendências da noite na conferência da manhã', () => {
    render(<DeliveryReceivablesPanel date="2026-11-25" courier allowedOrderIds={['morning']} />);
    expect(screen.getByText(/Cliente da manhã/)).toBeInTheDocument();
    expect(screen.queryByText(/Cliente da noite/)).not.toBeInTheDocument();
  });
  it('preserva pedidos sem designação separados dos turnos conhecidos', () => {
    render(<DeliveryReceivablesPanel date="2026-11-25" courier excludedOrderIds={['morning', 'night']} />);
    expect(screen.getByText(/Cliente sem designação/)).toBeInTheDocument();
    expect(screen.queryByText(/Cliente da manhã/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cliente da noite/)).not.toBeInTheDocument();
  });
});