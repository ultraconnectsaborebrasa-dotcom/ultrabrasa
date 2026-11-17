import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditWhatsAppRequest } from '@/components/pdv/EditWhatsAppRequest';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

const request = {
  customer: 'Flávia Mas Vai Entregar', payment: 'Pix', note: '', type: 'Delivery',
  items: [{ productId: 'marmita', qty: 1, note: 'Sem salada', quotedPrice: 19.9 }],
  summary: [{ productId: 'marmita', name: 'Marmita completa', qty: 1, price: 19.9 }],
  delivery: { address: { street: 'Rua A', number: '10', neighborhood: 'Centro', reference: '' } },
};

describe('janela de edição antes da cozinha', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockImplementation((name: string) => Promise.resolve(name === 'read_pdv_cashier'
      ? { data: { products: [{ id: 'marmita', name: 'Marmita completa', price: 19.9, stock: 20, active: true }, { id: 'soda', name: 'Refrigerante', price: 6, stock: 10, active: true }] }, error: null }
      : { data: { total: 25.9 }, error: null }) as never);
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('adiciona outro produto e salva o nome válido do WhatsApp', async () => {
    const onSaved = vi.fn();
    render(<EditWhatsAppRequest id="request-1" request={request} whatsappName="Flávia Silva" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByDisplayValue('Flávia Silva')).toBeInTheDocument();
    const select = await screen.findByLabelText('Produto para adicionar');
    await waitFor(() => expect(select).not.toBeDisabled());
    fireEvent.change(select, { target: { value: 'soda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar produto' }));
    expect(screen.getByLabelText('Quantidade de Refrigerante')).toHaveValue(1);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const save = vi.mocked(supabase.rpc).mock.calls.find(call => call[0] === 'wa_edit_request');
    expect(save?.[1]).toMatchObject({
      _id: 'request-1',
      _patch: {
        customer: 'Flávia Silva',
        items: [{ productId: 'marmita', qty: 1, note: 'Sem salada' }, { productId: 'soda', qty: 1, note: '' }],
      },
    });
  });
});
