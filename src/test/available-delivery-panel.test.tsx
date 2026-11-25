import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailableDeliveryPanel } from '@/components/pdv/AvailableDeliveryPanel';
import type { Courier, Delivery } from '@/lib/delivery';
import type { CourierLiveLocation } from '@/lib/courier-operations';

const { locateMock, estimateMock } = vi.hoisted(() => ({ locateMock: vi.fn(), estimateMock: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn === 'locate-delivery' ? locateMock : estimateMock }));
vi.mock('@/lib/delivery-route.functions', () => ({ locateDeliveryOnMap: 'locate-delivery', estimateCourierDelivery: 'estimate-delivery' }));

const delivery: Delivery = {
  id: 'delivery-1', order_id: 'order-1', number: 900, customer: 'Cliente Teste', phone: '', created_at: '', delivered_at: null,
  address: { label: '', street: 'Rua Teste', number: '10', neighborhood: 'Centro', city: 'Eunápolis', state: 'BA', postalCode: '', complement: '', reference: '', latitude: '-16.35', longitude: '-39.57' },
  status: 'Pronto para entrega', route_id: null, position: 0, courier_id: null, total: null, due: null, payment_method: 'Pix', change: null, problem: null,
  items: [{ name: 'Marmita completa', qty: 1 }],
};
const couriers: Courier[] = [
  { id: 'near', name: 'Perto', phone: '', user_id: null, active: true, operational_status: 'available', initial_quantity: 20, remaining_quantity: 20, available_quantity: 20, product_name: 'Marmita completa' },
  { id: 'far', name: 'Longe', phone: '', user_id: null, active: true, operational_status: 'available', initial_quantity: 20, remaining_quantity: 20, available_quantity: 20, product_name: 'Marmita completa' },
];
const location = (courier_id: string, latitude: number, located_at: string): CourierLiveLocation => ({ courier_id, name: courier_id, latitude, longitude: -39.57, accuracy_meters: 10, located_at, consent_at: located_at });

function renderPanel(locations: CourierLiveLocation[], onAssign = vi.fn(), currentDelivery = delivery, customCouriers = couriers, onFocusDelivery = vi.fn()) {
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><AvailableDeliveryPanel deliveries={[currentDelivery]} couriers={customCouriers} locations={locations} baseAddress="Base Teste" selectedDeliveryId={currentDelivery.id} onFocusDelivery={onFocusDelivery} onLocated={vi.fn()} onAssign={onAssign} /></QueryClientProvider>);
  return onAssign;
}

describe('designação da entrega pelo motoboy mais próximo', () => {
  beforeEach(() => { vi.useRealTimers(); locateMock.mockReset(); estimateMock.mockReset(); });

  it('destaca o GPS mais próximo e designa exatamente a entrega selecionada', () => {
    const now = new Date().toISOString();
    const assign = renderPanel([location('far', -16.36, now), location('near', -16.35, now)]);
    expect(screen.getByText('Recomendado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Designar Perto' }));
    expect(assign).toHaveBeenCalledWith('near', 'Base Teste', ['delivery-1']);
  });

  it('não recomenda um GPS desatualizado mesmo estando mais perto', () => {
    const fresh = new Date().toISOString();
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    renderPanel([location('near', -16.35, stale), location('far', -16.36, fresh)]);
    const farCard = screen.getByRole('button', { name: 'Designar Longe' }).closest('article');
    const nearCard = screen.getByRole('button', { name: 'Designar Perto' }).closest('article');
    expect(farCard?.textContent).toContain('Recomendado');
    expect(nearCard?.textContent).toContain('GPS desatualizado');
    expect(nearCard?.textContent).not.toContain('Recomendado');
  });

  it('não recomenda motoboy sem estoque compatível', () => {
    const emptyCouriers = couriers.map(courier => ({ ...courier, remaining_quantity: 0, available_quantity: 0 }));
    const assign = renderPanel([location('near', -16.35, new Date().toISOString())], vi.fn(), delivery, emptyCouriers);
    expect(screen.queryByRole('button', { name: /Designar/ })).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('designa hambúrguer sem carga para o entregador com ponto aberto', () => {
    const assign = vi.fn();
    const snack = { ...delivery, items: [{ name: 'Hambúrguer', qty: 2 }] };
    const driver = { ...couriers[0], id: 'near', name: 'Perto', phone: '', user_id: null, active: true, open_shift: true, remaining_quantity: null };
    renderPanel([], assign, snack, [driver]);
    fireEvent.click(screen.getByRole('button', { name: 'Designar Perto' }));
    expect(assign).toHaveBeenCalledWith('near', 'Base Teste', ['delivery-1']);
  });

  it('permite localizar uma saída que já está na rua sem oferecer nova designação', () => {
    const assign = renderPanel([], vi.fn(), { ...delivery, status: 'Em rota' });
    expect(screen.getByText('Entrega já na rua.', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Designar/ })).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('mantém a designação disponível quando o Google bloqueia a localização', async () => {
    locateMock.mockRejectedValue(new Error('Geocoding API bloqueada; você ainda pode designar a entrega sem o mapa.'));
    const focus = vi.fn();
    const unlocated = { ...delivery, address: { ...delivery.address, latitude: '', longitude: '' } };
    const assign = renderPanel([], vi.fn(), unlocated, couriers, focus);
    fireEvent.click(screen.getByRole('button', { name: /#900 · Cliente Teste/ }));
    await waitFor(() => expect(focus).toHaveBeenCalledWith(unlocated));
    fireEvent.click(screen.getByRole('button', { name: 'Designar Perto' }));
    expect(assign).toHaveBeenCalledWith('near', 'Base Teste', ['delivery-1']);
  });

  it('designa todas as entregas selecionadas do mesmo bairro em uma única revisão', () => {
    const second = { ...delivery, id: 'delivery-2', order_id: 'order-2', number: 901 };
    const assign = vi.fn();
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><AvailableDeliveryPanel deliveries={[delivery, second]} couriers={couriers} locations={[location('near', -16.35, new Date().toISOString())]} baseAddress="Base Teste" selectedDeliveryId={delivery.id} selectedDeliveryIds={[delivery.id, second.id]} onFocusDelivery={vi.fn()} onLocated={vi.fn()} onAssign={assign} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Designar 2 entregas para Perto' }));
    expect(assign).toHaveBeenCalledWith('near', 'Base Teste', ['delivery-1', 'delivery-2']);
    expect(locateMock).not.toHaveBeenCalled();
    expect(estimateMock).not.toHaveBeenCalled();
  });

  it('seleciona o grupo pelo bairro sem chamar a localização automática', () => {
    const select = vi.fn();
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><AvailableDeliveryPanel deliveries={[delivery]} couriers={couriers} locations={[]} baseAddress="Base Teste" selectedDeliveryId={null} selectedDeliveryIds={[]} onFocusDelivery={vi.fn()} onSelectDeliveries={select} onLocated={vi.fn()} onAssign={vi.fn()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: /Centro.*Selecionar grupo/ }));
    expect(select).toHaveBeenCalledWith([delivery]);
    expect(locateMock).not.toHaveBeenCalled();
  });

  it('seleciona bairros próximos do mesmo distrito oficial sem chamar o Google', () => {
    const select = vi.fn();
    const second = { ...delivery, id: 'delivery-2', order_id: 'order-2', number: 901, address: { ...delivery.address, neighborhood: 'Vivendas Costa Azul' } };
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><AvailableDeliveryPanel deliveries={[delivery, second]} couriers={couriers} locations={[]} baseAddress="Base Teste" selectedDeliveryId={null} selectedDeliveryIds={[]} onFocusDelivery={vi.fn()} onSelectDeliveries={select} onLocated={vi.fn()} onAssign={vi.fn()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: '01 · Centro · Selecionar distrito' }));
    expect(select).toHaveBeenCalledWith([delivery, second]);
    expect(locateMock).not.toHaveBeenCalled();
    expect(estimateMock).not.toHaveBeenCalled();
  });

  it('abre a correção manual do ponto da entrega escolhida', () => {
    const edit = vi.fn();
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><AvailableDeliveryPanel deliveries={[delivery]} couriers={couriers} locations={[]} baseAddress="Base Teste" selectedDeliveryId={delivery.id} onFocusDelivery={vi.fn()} onLocated={vi.fn()} onEditLocation={edit} onAssign={vi.fn()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir ponto no mapa' }));
    expect(edit).toHaveBeenCalledWith(delivery);
  });
});
