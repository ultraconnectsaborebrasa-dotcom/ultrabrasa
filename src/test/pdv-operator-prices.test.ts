import { describe, it, expect } from 'vitest';
import { operatorSubtotal } from '@/lib/pdv-operator';
describe('Valores no atendimento', () => {
  it('calcula o subtotal a partir do preço unitário e da quantidade', () => {
    expect(operatorSubtotal([{price:8,qty:3}])).toBe(24);
  });
  it('soma os subtotais de todos os itens', () => {
    expect(operatorSubtotal([{price:8,qty:3},{price:6.5,qty:2}])).toBe(37);
  });
  it('não inventa preço zero quando um preço está ausente', () => {
    expect(operatorSubtotal([{price:null,qty:3}])).toBeNull();
  });
});