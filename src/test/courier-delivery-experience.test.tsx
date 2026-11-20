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

  it('confirma chegada sem concluir a entrega', () => {
    const onArrived = vi.fn();
    render(<CourierDeliveryExperience deliveries={[delivery('a', 1, 'Em rota')]} routes={[route]} couriers={[]} busy={false} loading={false} refreshing={false} error="" onRefresh={vi.fn()} onStart={vi.fn()} onArrived={onArrived} onDeliver={vi.fn()} onProblem={vi.fn(async () => true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar chegada' }));
    expect(onArrived).toHaveBeenCalledWith('a');
    expect(screen.getByRole('button', { name: 'Confirmar entrega' })).toBeInTheDocument();
  });

  it('registra recebimento sem alterar a etapa logística', async () => {
    const onReceivePayment = vi.fn();
    const unpaid = { ...delivery('a', 1, 'Em rota'), due: 19.9, payment_status: 'Pendente' };
    render(<CourierDeliveryExperience deliveries={[unpaid]} routes={[route]} couriers={[]} busy={false} loading={false} refreshing={false} error="" onRefresh={vi.fn()} onStart={vi.fn()} onReceivePayment={onReceivePayment} onDeliver={vi.fn()} onProblem={vi.fn(async () => true)} />);
    fireEvent.click(screen.getByRole('button', { name: /Registrar recebimento/ }));
    await waitFor(() => expect(onReceivePayment).toHaveBeenCalledWith('order-a', 'Pix'));
    expect(screen.getByRole('button', { name: 'Confirmar entrega' })).toBeInTheDocument();
  });

  it('mantém a parada com chegada confirmada até concluir ou registrar ocorrência', () => {
    const arrived = { ...delivery('a', 1, 'Em rota'), arrived_at: '2026-11-19T13:00:00Z' };
    render(<CourierDeliveryExperience deliveries={[arrived, delivery('b', 2, 'Em rota')]} routes={[route]} couriers={[]} busy={false} loading={false} refreshing={false} error="" onRefresh={vi.fn()} onStart={vi.fn()} onDeliver={vi.fn()} onProblem={vi.fn(async () => true)} />);
    expect(screen.getByRole('button', { name: /#102 · Cliente b/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /#101 · Cliente a/ })).toBeEnabled();
  });
});
