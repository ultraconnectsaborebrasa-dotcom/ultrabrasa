export type EditableRequestItem = { productId: string; qty: number; note?: string; name?: string; price?: number };
export type EditableProduct = { id: string; name: string; price: number; stock: number | null; active: boolean };

/** Acrescenta um produto do PDV sem duplicar uma linha que já está na comanda. */
export function addProductToRequestItems(items: EditableRequestItem[], product: EditableProduct) {
  if (!product.active || product.stock === 0) return items;
  const existing = items.find(item => item.productId === product.id);
  if (existing) return items.map(item => item.productId === product.id ? { ...item, qty: Math.min(50, item.qty + 1), name: product.name, price: product.price } : item);
  return [...items, { productId: product.id, qty: 1, note: '', name: product.name, price: product.price }];
}
