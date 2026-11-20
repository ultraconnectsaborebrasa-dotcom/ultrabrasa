import { describe, expect, it } from 'vitest';
import { courierMarmitaStock, deliveryMarmitaQuantity, marmitaSelectionError, type Courier, type Delivery } from '@/lib/delivery';

const courier: Courier = { id: 'driver-1', name: 'Mateus', phone: '', user_id: null, active: true, initial_quantity: 20, remaining_quantity: 18 };
const delivery = (id: string, qty: number, status: Delivery['status'] = 'Pronto para entrega', routeId: string | null = null): Delivery => ({
  id, order_id: id, number: 1, customer: 'Cliente', phone: '', created_at: '', delivered_at: null,
  address: { label: '', street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'Eunápolis', state: 'BA', postalCode: '', complement: '', reference: '', latitude: '', longitude: '' },
  status, route_id: routeId, position: 1, courier_id: 'driver-1', total: null, due: null, payment_method: 'Pix', change: null, problem: null,
  items: [{ name: 'Marmita completa', qty }, { name: 'Refrigerante', qty: 1 }],
});

describe('estoque de marmitas dos entregadores', () => {
  it('conta somente as marmitas, sem misturar outros produtos', () => {
    expect(deliveryMarmitaQuantity(delivery('1', 3))).toBe(3);
  });

  it('separa o saldo físico, as reservas abertas e o disponível para novas entregas', () => {
    const stock = courierMarmitaStock(courier, [delivery('1', 3, 'Pronto para entrega', 'route-1'), delivery('2', 2, 'Entregue', 'route-2')]);
    expect(stock).toEqual({ initial: 20, remaining: 18, reserved: 3, available: 15 });
  });

  it('libera a reserva da própria rota durante a edição', () => {
    const existing = delivery('1', 3, 'Pronto para entrega', 'route-1');
    expect(courierMarmitaStock(courier, [existing], 'route-1').available).toBe(18);
  });

  it('bloqueia uma seleção maior que o saldo disponível', () => {
    const selected = [delivery('new-1', 18), delivery('new-2', 1)];
    expect(marmitaSelectionError(courier, [], selected)).toBe('Marmitas insuficientes: 18 disponível(is) e 19 selecionada(s).');
    expect(marmitaSelectionError(courier, [], [delivery('new-1', 18)])).toBeNull();
  });

  it('exige carga registrada antes de designar marmitas', () => {
    const withoutStock = { ...courier, remaining_quantity: null, initial_quantity: null };
    expect(marmitaSelectionError(withoutStock, [], [delivery('new-1', 1)])).toBe('Registre a carga de marmitas deste entregador antes de salvar a rota.');
  });

  it('não recomenda entregador indisponível mesmo com estoque', () => {
    const returning = { ...courier, operational_status: 'returning' as const };
    expect(marmitaSelectionError(returning, [], [delivery('new-1', 1)])).toBe('Este entregador não está disponível para novas atribuições.');
  });

  it('bloqueia carga de outro tipo de marmita', () => {
    const typed = { ...courier, product_id: 'product-marmita-completa', product_name: 'Marmita completa' };
    const selected = { ...delivery('new-1', 1), items: [{ productId: 'product-marmita-especial', name: 'Marmita especial', qty: 1 }] };
    expect(marmitaSelectionError(typed, [], [selected])).toBe('A carga atual de Marmita completa não é compatível com este pedido.');
  });
});
