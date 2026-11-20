import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransferDeliveryControl } from '@/components/pdv/TransferDeliveryControl';
import { emptyDelivery, type Courier, type Delivery } from '@/lib/delivery';

const delivery: Delivery = {
  id: 'delivery-1', order_id: 'order-1', number: 900, customer: 'Cliente', phone: '', created_at: '', delivered_at: null,
  address: emptyDelivery().address, status: 'Em rota', route_id: 'route-1', position: 1, courier_id: 'old', total: 19.9, due: 0,
  payment_method: 'Pix', payment_status: 'Pago', change: 0, problem: null, items: [{ productId: 'product-marmita-completa', name: 'Marmita completa', qty: 1 }],
};
const courier: Courier = { id: 'new', name: 'Novo motoboy', phone: '', user_id: null, active: true, operational_status: 'available', remaining_quantity: 10, initial_quantity: 10, available_quantity: 10, product_id: 'product-marmita-completa', product_name: 'Marmita completa' };

describe('transferência operacional de entrega', () => {
  afterEach(cleanup);
  it('transfere somente a entrega escolhida para o motoboy com estoque', async () => {
    const onTransfer = vi.fn(async () => true);
    render(<TransferDeliveryControl delivery={delivery} deliveries={[delivery]} couriers={[courier]} busy={false} onTransfer={onTransfer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar transferência' }));
    await waitFor(() => expect(onTransfer).toHaveBeenCalledWith('delivery-1', 'new'));
  });

  it('não permite escolher um motoboy sem estoque', () => {
    render(<TransferDeliveryControl delivery={delivery} deliveries={[delivery]} couriers={[{ ...courier, remaining_quantity: 0, available_quantity: 0 }]} busy={false} onTransfer={vi.fn(async () => true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));
    expect(screen.getByRole('option', { name: /Novo motoboy · Marmitas insuficientes/ })).toBeDisabled();
  });
});
