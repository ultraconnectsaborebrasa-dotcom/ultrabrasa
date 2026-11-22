import { describe, expect, it } from 'vitest';
import { canCorrectDeliveryMapPin, type DeliveryStatus } from '@/lib/delivery';

const eligible = (status: DeliveryStatus) => canCorrectDeliveryMapPin({ status });

describe('correção manual do ponto da entrega', () => {
  it('mantém a correção disponível depois que a entrega pronta é designada', () => {
    expect(eligible('Pronto para entrega')).toBe(true);
  });

  it('permite corrigir o ponto depois que o motoboy saiu para entrega', () => {
    expect(eligible('Em rota')).toBe(true);
  });

  it('não permite alterar entregas concluídas, canceladas ou ainda em preparo', () => {
    expect(eligible('Entregue')).toBe(false);
    expect(eligible('Cancelado')).toBe(false);
    expect(eligible('Aguardando preparo')).toBe(false);
  });
});
