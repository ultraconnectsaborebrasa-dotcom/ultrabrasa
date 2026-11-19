import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourierDeliveryExperience } from '@/components/pdv/CourierDeliveryExperience';
import { emptyDelivery, type Delivery, type DeliveryRoute } from '@/lib/delivery';

vi.mock('@/components/pdv/CourierOperationsPanel', () => ({ CourierOperationsPanel: () => <div>Operação do mapa</div> }));
vi.mock('@/lib/confirm-action', () => ({ confirmAction: vi.fn(async () => true) }));

const route: DeliveryRoute = { id: 'route-1', name: 'Rota da manhã', courier_id: 'courier-1', created_at: '2026-11-19T12:00:00Z', origin: 'Base', distance_meters: null, duration_seconds: null };
const delivery = (id: string, position: number, status: Delivery['status']): Delivery => ({
  id, order_id: `order-${id}`, number: 100 + position, customer: `Cliente ${id}`, phone: '',
  address: { ...emptyDelivery().address, street: `Rua ${id}`, number: String(position), neighborhood: 'Centro', reference: 'Portão preto' },
  created_at: '2026-11-19T12:00:00Z', delivered_at: null, status, route_id: route.id, position, courier_id: route.courier_id,
  total: 19.9, due: 0, payment_method: 'Pix', payment_status: 'Pago', change: null, problem: null,
  items: [{ name: 'Marmita completa', qty: 1 }],
});

function renderExperience(status: Delivery['status'] = 'Pronto para entrega') {
  const onStart = vi.fn();
  const onDeliver = vi.fn();
  const onProblem = vi.fn(async () => true);
  render(<CourierDeliveryExperience deliveries={[delivery('a', 1, status), delivery('b', 2, status)]} routes={[route]} couriers={[]} busy={false} loading={false} refreshing={false} error="" onRefresh={vi.fn()} onStart={onStart} onDeliver={onDeliver} onProblem={onProblem} />);
  return { onStart, onDeliver, onProblem };
}

describe('aplicativo de entregas do motoboy', () => {
  afterEach(cleanup);

  it('mostra o pedido designado e as paradas antes de iniciar', () => {
    const { onStart } = renderExperience();
    expect(screen.getByText('PRÓXIMA PARADA')).toBeInTheDocument();
    expect(screen.getByText('Paradas da rota')).toBeInTheDocument();
    expect(screen.getAllByText('Referência: Portão preto').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar rota' }));
    expect(onStart).toHaveBeenCalledWith('route-1');
  });

  it('mantém a baixa manual na parada escolhida', async () => {
    const { onDeliver } = renderExperience('Em rota');
    fireEvent.click(screen.getByRole('button', { name: /#102 · Cliente b/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }));
    await waitFor(() => expect(onDeliver).toHaveBeenCalledWith('b'));
  });
});
