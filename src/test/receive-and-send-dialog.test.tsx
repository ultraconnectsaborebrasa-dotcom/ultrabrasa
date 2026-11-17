import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReceiveAndSendDialog } from '@/components/pdv/ReceiveAndSendDialog';

afterEach(cleanup);

describe('recebimento antes do envio à cozinha', () => {
  it('confirma a forma escolhida e mostra o total do pedido', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ReceiveAndSendDialog
        total={39.8}
        methods={['Pix', 'Dinheiro', 'Cartão']}
        busy={false}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/R\$\s*39,80/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Forma de pagamento do novo pedido'), { target: { value: 'Pix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Receber, imprimir e enviar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Pix'));
  });

  it('oferece recebimento direto com impressão e sem cozinha', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ReceiveAndSendDialog
        mode="direct"
        total={19.9}
        methods={['Pix', 'Dinheiro']}
        busy={false}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Receber e finalizar' })).toBeInTheDocument();
    expect(screen.getByText(/sem enviar à cozinha/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Forma de pagamento do novo pedido'), { target: { value: 'Dinheiro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Receber, imprimir e finalizar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Dinheiro'));
  });
});
