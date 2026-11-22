import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CatalogCheckout } from '@/components/catalog/CatalogCheckout';
import { dailyOfferState, type CartLine, type DailyOffer } from '@/lib/catalog';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

const offer: DailyOffer = {
  productId: 'product-marmita-completa', name: 'Marmita completa', title: 'Cardápio de hoje',
  description: 'Marmita do dia', accompaniments: ['Arroz'], active: true, price: 19.9,
  stock: 10, minStock: 5, available: true, image: null,
};
const cart: CartLine[] = [{ productId: offer.productId, name: offer.name, price: offer.price, qty: 1, note: '' }];

describe('estoque esgotado no cardápio público', () => {
  it('deixa a oferta indisponível mesmo com estoque e horário válidos', () => {
    expect(dailyOfferState(offer, true, true)).toBe('unavailable');
    expect(dailyOfferState(offer, true, false)).toBe('available');
  });

  it('não permite finalizar o carrinho enquanto o bloqueio estiver ativo', () => {
    render(<CatalogCheckout cart={cart} setCart={vi.fn()} open setOpen={vi.fn()} orderingDisabled />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cardápio indisponível no momento');
    expect(screen.getByRole('button', { name: 'Indisponível no momento' })).toBeDisabled();
  });

  it('volta a permitir finalizar quando o bloqueio é encerrado', () => {
    render(<CatalogCheckout cart={cart} setCart={vi.fn()} open setOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Finalizar pedido/ })).toBeEnabled();
  });
});
