import { describe, expect, it } from 'vitest';
import { adjustmentTotal, moneyInput } from '@/lib/order-adjustments';

describe('Ajustes do Caixa', () => {
  it('deduz desconto sem retirar a entrega', () => expect(adjustmentTotal(39.8, 5, 0, 4.8, 0)).toBe(40));
  it('acrescenta valor além da entrega e serviço', () => expect(adjustmentTotal(39.8, 5, 3.98, 0, 2)).toBe(50.78));
  it('combina desconto e acréscimo', () => expect(adjustmentTotal(39.8, 0, 0, 5, 2)).toBe(36.8));
  it('não aceita desconto maior que produtos', () => expect(() => adjustmentTotal(19.9, 5, 0, 20, 0)).toThrow());
  it('não aceita acréscimo negativo ou inválido', () => { expect(() => adjustmentTotal(19.9, 0, 0, 0, -1)).toThrow(); expect(() => adjustmentTotal(19.9, 0, 0, 0, NaN)).toThrow(); });
  it('aceita valores brasileiros', () => expect(moneyInput('2,50')).toBe(2.5));
});