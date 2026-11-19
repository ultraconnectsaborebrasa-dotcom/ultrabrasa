import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppManualOrderCard } from '@/components/pdv/WhatsAppManualOrderCard';
import { emptyDelivery } from '@/lib/delivery';

const delivery = emptyDelivery();
delivery.address = { ...delivery.address, street: 'Rua A', number: '10', neighborhood: 'Centro', reference: 'Ao lado da praça' };

const order = { phone: '5573999990000', customer: 'Ana Souza', type: 'Delivery' as const, delivery, paymentLabel: 'Pix' };

describe('resumo dos dados para o pedido manual', () => {
  afterEach(cleanup);

  it('mostra os dados enviados e entrega a mesma sugestão para o atendente revisar', () => {
    const build = vi.fn();
    render(<WhatsAppManualOrderCard order={order} onBuildOrder={build} />);

    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Rua A')).toBeInTheDocument();
    expect(screen.getByText('Ao lado da praça')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preencher pedido' }));
    expect(build).toHaveBeenCalledWith(order);
  });
});
