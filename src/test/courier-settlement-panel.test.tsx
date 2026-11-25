import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourierSettlementPanel } from '@/components/pdv/CourierSettlementPanel';
import type { CourierSettlementRow } from '@/lib/courier-settlement';

const rows: CourierSettlementRow[] = [
  { order_id: 'one', number: 1, customer: 'Cliente A', courier_id: 'jose', courier_name: 'José', status: 'Entregue', category: 'cash', amount: 40, method: 'Dinheiro', paid_at: null },
  { order_id: 'two', number: 2, customer: 'Cliente B', courier_id: 'ana', courier_name: 'Ana', status: 'Entregue', category: 'card', amount: 25, method: 'Pix', paid_at: null },
];
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: rows, isPending: false, isFetching: false, error: null, refetch: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

afterEach(cleanup);
describe('consulta de acertos da equipe', () => {
  it('não expõe registros antes da busca e seleção e restringe o resultado ao entregador escolhido', () => {
    const { container } = render(<CourierSettlementPanel admin />);
    expect(container.querySelectorAll('article')).toHaveLength(0);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'jose' } });
    expect(container.querySelectorAll('article')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'José' }));
    expect(container.querySelectorAll('article')).toHaveLength(1);
    expect(screen.getByText(/Cliente A/)).toBeInTheDocument();
    expect(screen.queryByText(/Cliente B/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar acerto' }));
    expect(container.querySelectorAll('article')).toHaveLength(0);
  });
  it('recolhe os registros quando a busca é limpa ou o dia muda', () => {
    const { container } = render(<CourierSettlementPanel admin />);
    const selectJose = () => {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'José' } });
      fireEvent.click(screen.getByRole('button', { name: 'José' }));
    };
    selectJose();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca e ocultar acerto' }));
    expect(container.querySelectorAll('article')).toHaveLength(0);
    selectJose();
    fireEvent.change(screen.getByLabelText('Dia do acerto'), { target: { value: '2026-11-24' } });
    expect(container.querySelectorAll('article')).toHaveLength(0);
  });
});