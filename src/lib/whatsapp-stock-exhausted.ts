export const STOCK_EXHAUSTED_MESSAGE = 'Infelizmente, hoje já encerramos nossos atendimentos! ❤️ Nossa demanda foi muito alta e todos os pedidos foram atendidos.\n\nAmanhã estaremos funcionando normalmente. Então, já garanta o seu pedido mais cedo para não ficar sem! 😋\n\nAgradecemos pela compreensão e preferência. Deus abençoe! 🙏';

export function isStockExhaustedJob(key: string): boolean {
  return key.startsWith('stock-exhausted:');
}
