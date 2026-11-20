import { describe, expect, it } from 'vitest';
import { initialOrderStatus, isMarmitaOnlyOrder } from '@/lib/marmita-order';

const products = [
  { id: 'marmita', category: 'Marmitas' },
  { id: 'marmita-2', category: ' marmitas ' },
  { id: 'hamburguer', category: 'Hambúrgueres' },
];

describe('marmitas prontas sem cozinha', () => {
  it('deixa pronto somente o pedido exclusivamente de marmitas', () => {
    expect(isMarmitaOnlyOrder([{ productId: 'marmita' }, { productId: 'marmita-2' }], products)).toBe(true);
    expect(initialOrderStatus([{ productId: 'marmita' }], products)).toBe('pronto');
  });

  it('mantém o pedido misto na cozinha por causa dos itens que exigem preparo', () => {
    expect(isMarmitaOnlyOrder([{ productId: 'marmita' }, { productId: 'hamburguer' }], products)).toBe(false);
    expect(initialOrderStatus([{ productId: 'marmita' }, { productId: 'hamburguer' }], products)).toBe('cozinha');
  });

  it('não trata carrinho vazio ou produto desconhecido como marmita pronta', () => {
    expect(isMarmitaOnlyOrder([], products)).toBe(false);
    expect(isMarmitaOnlyOrder([{ productId: 'desconhecido' }], products)).toBe(false);
  });
});
