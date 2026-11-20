/** Venda direta finaliza pedidos locais; Delivery fica pago e pronto para designar entregador. */
export const canDirectSale = (type: string) => ['Balcão', 'Mesa', 'Retirada', 'Delivery'].includes(type);
