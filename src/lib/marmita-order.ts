export type MarmitaOrderProduct = { id: string; category: string };
export type MarmitaOrderItem = { productId: string };

/** Somente pedidos exclusivamente de marmitas pulam o preparo; itens mistos continuam na cozinha. */
export function isMarmitaOnlyOrder(items: MarmitaOrderItem[], products: MarmitaOrderProduct[]): boolean {
  if (!items.length) return false;
  return items.every(item => products.find(product => product.id === item.productId)?.category.trim().toLocaleLowerCase('pt-BR') === 'marmitas');
}

export function initialOrderStatus(items: MarmitaOrderItem[], products: MarmitaOrderProduct[]): 'cozinha' | 'pronto' {
  return isMarmitaOnlyOrder(items, products) ? 'pronto' : 'cozinha';
}
