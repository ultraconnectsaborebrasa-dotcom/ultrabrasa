import { describe, expect, it } from 'vitest';
import { canReceiveCourierAssignments, directoryCouriers, type Courier } from '@/lib/delivery';

const courier = (id: string, active: boolean, deleted_at: string | null = null): Courier => ({ id, name: id, phone: '', user_id: null, active, deleted_at });

describe('gerenciamento de entregadores', () => {
  it('remove desativados e excluídos das novas designações', () => {
    expect(canReceiveCourierAssignments(courier('Ativo', true))).toBe(true);
    expect(canReceiveCourierAssignments(courier('Desativado', false))).toBe(false);
    expect(canReceiveCourierAssignments(courier('Excluído', false, '2026-11-23T13:00:00Z'))).toBe(false);
  });

  it('oculta desativados por padrão e permite reativá-los pelo cadastro', () => {
    const couriers = [courier('Ativo', true), courier('Desativado', false)];
    expect(directoryCouriers(couriers).map(item => item.id)).toEqual(['Ativo']);
    expect(directoryCouriers(couriers, true).map(item => item.id)).toEqual(['Ativo', 'Desativado']);
  });

  it('não lista o excluído, mas mantém seu registro disponível para o histórico', () => {
    const deleted = courier('Excluído', false, '2026-11-23T13:00:00Z');
    const couriers = [courier('Ativo', true), deleted];
    expect(directoryCouriers(couriers, true).map(item => item.id)).toEqual(['Ativo']);
    expect(couriers.find(item => item.id === 'Excluído')?.name).toBe('Excluído');
  });
});
