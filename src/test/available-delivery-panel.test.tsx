import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailableDeliveryPanel } from '@/components/pdv/AvailableDeliveryPanel';
import type { Courier, Delivery } from '@/lib/delivery';
import type { CourierLiveLocation } from '@/lib/courier-operations';

vi.mock('@tanstack/react-start', () => ({ useServerFn: () => vi.fn() }));
vi.mock('@/lib/delivery-route.functions', () => ({ locateDeliveryOnMap: 'locate-delivery' }));

const delivery: Delivery = {
  id: 'delivery-1', order_id: 'order-1', number: 900, customer: 'Cliente Teste', phone: '', created_at: '', delivered_at: null,
  address: { label: '', street: 'Rua Teste', number: '10', neighborhood: 'Centro', city: 'Eunápolis', state: 'BA', postalCode: '', complement: '', reference: '', latitude: '-16.35', longitude: '-39.57' },
  status: 'Pronto para entrega', route_id: null, position: 0, courier_id: null, total: null, due: null, payment_method: 'Pix', change: null, problem: null,
  items: [{ name: 'Marmita completa', qty: 1 }],
};
const couriers: Courier[] = [
  { id: 'near', name: 'Perto', phone: '', user_id: null, active: true },
  { id: 'far', name: 'Longe', phone: '', user_id: null, active: true },
];
const location = (courier_id: string, latitude: number, located_at: string): CourierLiveLocation => ({ courier_id, name: courier_id, latitude, longitude: -39.57, accuracy_meters: 10, located_at, consent_at: located_at });

function renderPanel(locations: CourierLiveLocation[], onAssign = vi.fn(), currentDelivery = delivery) {
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><AvailableDeliveryPanel deliveries={[currentDelivery]} couriers={couriers} locations={locations} baseAddress="Base Teste" selectedDeliveryId={currentDelivery.id} onFocusDelivery={vi.fn()} onLocated={vi.fn()} onAssign={onAssign} /></QueryClientProvider>);
  return onAssign;
}

describe('designação da entrega pelo motoboy mais próximo', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('destaca o GPS mais próximo e designa exatamente a entrega selecionada', () => {
    const now = new Date().toISOString();
    const assign = renderPanel([location('far', -16.36, now), location('near', -16.35, now)]);
    expect(screen.getByText('Mais próximo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Designar Perto' }));
    expect(assign).toHaveBeenCalledWith('near', 'Base Teste', ['delivery-1']);
  });

  it('não recomenda um GPS desatualizado mesmo estando mais perto', () => {
    const fresh = new Date().toISOString();
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    renderPanel([location('near', -16.35, stale), location('far', -16.36, fresh)]);
    const farCard = screen.getByRole('button', { name: 'Designar Longe' }).closest('article');
    const nearCard = screen.getByRole('button', { name: 'Designar Perto' }).closest('article');
    expect(farCard?.textContent).toContain('Mais próximo');
    expect(nearCard?.textContent).toContain('GPS desatualizado');
    expect(nearCard?.textContent).not.toContain('Mais próximo');
  });

  it('permite localizar uma saída que já está na rua sem oferecer nova designação', () => {
    const assign = renderPanel([], vi.fn(), { ...delivery, status: 'Em rota' });
    expect(screen.getByText('Entrega já na rua.', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Designar/ })).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });
});
