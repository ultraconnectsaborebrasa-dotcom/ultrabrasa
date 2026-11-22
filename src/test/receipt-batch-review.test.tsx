import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptReview } from '@/components/pdv/ReceiptReview';
import { supabase } from '@/integrations/supabase/client';
import { confirmAction } from '@/lib/confirm-action';
import type { Database } from '@/integrations/supabase/types';

type Receipt = Database['public']['Tables']['payment_receipts']['Row'];
type Query = {
  select: () => Query;
  eq: () => Query;
  in: () => Query;
  order: () => Query;
  limit: () => Promise<{ data: Receipt[]; error: null }>;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock('@/lib/confirm-action', () => ({ confirmAction: vi.fn(), promptAction: vi.fn() }));
vi.mock('@/components/pdv/ReceiptRegistration', () => ({ ReceiptRegistration: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

let rows: Receipt[] = [];
const receipt = (id: string, linked: boolean): Receipt => ({
  id,
  message_id: `message-${id}`,
  phone: '5573999999999',
  request_id: linked ? `request-${id}` : null,
  order_id: null,
  storage_path: null,
  file_hash: null,
  transaction_id: null,
  evidence: { isPixReceipt: false },
  state: 'review',
  reason: 'Arquivo recebido — verificar',
  amount: 19.9,
  received_at: '2026-11-22T03:00:00Z',
  reviewed_at: null,
  reviewed_by: null,
});

function query(): Query {
  const q: Query = {
    select: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    limit: async () => ({ data: rows, error: null }),
  };
  return q;
}

describe('Baixa em lote na conferência de comprovantes', () => {
  beforeEach(() => {
    rows = [receipt('r1', true), receipt('r2', true), receipt('r3', false)];
    vi.mocked(supabase.from).mockImplementation(() => query() as never);
    vi.mocked(supabase.rpc).mockReset().mockResolvedValue({ data: { confirmed: 2, amount: 39.8, skipped: [] }, error: null } as never);
    vi.mocked(confirmAction).mockReset().mockResolvedValue(true);
  });

  afterEach(cleanup);

  it('confirma todos os arquivos como Pix, incluindo os que não têm pedido vinculado', async () => {
    render(<ReceiptReview />);
    const button = await screen.findByRole('button', { name: 'Dar baixa em todos (3)' });
    fireEvent.click(button);

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('confirm_receipt_payments_batch', { _ids: ['r1', 'r2', 'r3'], _method: 'Pix' }));
    expect(confirmAction).toHaveBeenCalledWith(expect.stringContaining('1 arquivo(s) sem pedido'), 'Dar baixa em todos');
    expect(screen.getByText(/1 arquivo\(s\) sem pedido serão apenas confirmados/)).toBeInTheDocument();
  });

  it('permite confirmar individualmente um arquivo sem pedido sem alterar vendas', async () => {
    rows = [receipt('r3', false)];
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { withoutOrder: true, confirmed: true, amount: 0 }, error: null } as never);
    render(<ReceiptReview />);
    const button = await screen.findByRole('button', { name: 'Conferir e dar baixa' });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('confirm_receipt_without_order', { _id: 'r3', _method: 'Pix' }));
    expect(supabase.rpc).not.toHaveBeenCalledWith('confirm_receipt_payment', expect.anything());
  });
});
