/** Venda direta finaliza apenas pedidos sem logística de entrega. */
export const canDirectSale = (type: string) => type !== 'Delivery';
