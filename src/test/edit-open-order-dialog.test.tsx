import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditOpenOrderDialog, type EditableOpenOrder } from '@/components/pdv/EditOpenOrderDialog';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: rpcMock } }));

const order: EditableOpenOrder = {
  id: 'order-1', number: 42, status: 'cozinha', note: 'Chamar ao ficar pronto', payments: [], discount: 0, fee: 0, serviceFee: false,
  items: [{ uid: 'old-1', productId: 'product-espeto', name: 'Espeto', qty: 2, price: 8, note: 'Ao ponto' }],
};
const products = [
  { id: 'product-espeto', name: 'Espeto', category: 'Espetinhos', price: 8, stock: 5, active: true },
  { id: 'product-refri', name: 'Refrigerante', category: 'Bebidas', price: 6, stock: 2, active: true },
];

describe('janela de edição da comanda', () => {
  beforeEach(() => rpcMock.mockReset().mockResolvedValue({ error: null }));

  it('adiciona e remove produtos e salva as observações sem alterar a etapa', async () => {
    const saved = vi.fn();
    const closed = vi.fn();
    render(<EditOpenOrderDialog order={order} products={products} serviceFeePct={0} onClose={closed} onSaved={saved} />);

    fireEvent.click(screen.getByRole('button', { name: /Refrigerante\s+R\$\s*6/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Observação de Refrigerante' }), { target: { value: 'Bem gelado' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Observações gerais da comanda' }), { target: { value: 'Cliente ligou' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover Espeto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledOnce());
    expect(rpcMock).toHaveBeenCalledWith('update_pdv_open_order', {
      order_id: 'order-1',
      input_items: [{ productId: 'product-refri', qty: 1, note: 'Bem gelado' }],
      order_note: 'Cliente ligou',
    });
    expect(saved).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('não deixa salvar uma comanda sem nenhum item', () => {
    render(<EditOpenOrderDialog order={order} products={products} serviceFeePct={0} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Espeto' }));
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
