export function adjustmentTotal(subtotal: number, deliveryFee: number, service: number, discount: number, extra: number) {
  if (![subtotal, deliveryFee, service, discount, extra].every(Number.isFinite) || discount < 0 || extra < 0 || discount > subtotal) {
    throw new Error('Confira os valores. O desconto não pode superar o subtotal.');
  }
  return Math.round((subtotal + deliveryFee + service - discount + extra) * 100) / 100;
}

export function moneyInput(value: string) {
  return value.trim() === '' ? 0 : Number(value.replace(',', '.'));
}