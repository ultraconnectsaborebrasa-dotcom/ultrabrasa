import { describe, expect, it } from 'vitest';
import { addProductToRequestItems } from '@/lib/whatsapp-request-editor';

const soda = { id: 'soda', name: 'Refrigerante', price: 6, stock: 10, active: true };

describe('edição de pedido do WhatsApp', () => {
  it('adiciona um produto novo com uma unidade e o preço atual do PDV', () => {
    const items = addProductToRequestItems([{ productId: 'marmita', qty: 1, note: 'Sem salada' }], soda);
    expect(items).toEqual([
      { productId: 'marmita', qty: 1, note: 'Sem salada' },
      { productId: 'soda', qty: 1, note: '', name: 'Refrigerante', price: 6 },
    ]);
  });

  it('soma a quantidade quando o produto já está na comanda', () => {
    const items = addProductToRequestItems([{ productId: 'soda', qty: 1, note: 'Gelado' }], soda);
    expect(items).toEqual([{ productId: 'soda', qty: 2, note: 'Gelado', name: 'Refrigerante', price: 6 }]);
  });

  it('não adiciona produto inativo ou sem estoque', () => {
    expect(addProductToRequestItems([], { ...soda, active: false })).toEqual([]);
    expect(addProductToRequestItems([], { ...soda, stock: 0 })).toEqual([]);
  });
});
