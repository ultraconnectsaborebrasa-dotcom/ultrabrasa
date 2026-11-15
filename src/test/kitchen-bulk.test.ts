import { beforeEach, describe, expect, it, vi } from 'vitest';
import { kitchenBulkDestination, runKitchenBulkAction } from '@/lib/kitchen-bulk';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

beforeEach(() => rpc.mockReset());

describe('Baixa da cozinha em lote', () => {
  it('envia para entrega somente Delivery prontos sem finalizar', () => {
    expect(kitchenBulkDestination({ status: 'pronto', type: 'Delivery' }, 'depart')).toBe('entrega');
    for (const status of ['aberta', 'cozinha', 'entrega', 'entregue', 'cancelado']) {
      expect(kitchenBulkDestination({ status, type: 'Delivery' }, 'depart')).toBeNull();
    }
    for (const type of ['Mesa', 'Balcão', 'Retirada']) {
      expect(kitchenBulkDestination({ status: 'pronto', type }, 'depart')).toBeNull();
    }
  });

  it('envia todos para entrega em uma única chamada', async () => {
    rpc.mockResolvedValue({ data: 30, error: null });
    await expect(runKitchenBulkAction('depart')).resolves.toBe(30);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('bulk_depart_ready_orders');
  });

  it('propaga falha sem retornar uma baixa bem-sucedida', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Sem permissão') });
    await expect(runKitchenBulkAction('depart')).rejects.toThrow('Sem permissão');
  });
  it('marca como prontos somente os pedidos que estão na cozinha', () => {
    expect(kitchenBulkDestination({ status: 'cozinha', type: 'Mesa' }, 'ready')).toBe('pronto');
    expect(kitchenBulkDestination({ status: 'aberta', type: 'Mesa' }, 'ready')).toBeNull();
    expect(kitchenBulkDestination({ status: 'pronto', type: 'Delivery' }, 'ready')).toBeNull();
  });

  it('finaliza todos os pedidos ativos de Delivery como entregues', () => {
    for (const status of ['aberta', 'cozinha', 'pronto', 'entrega']) {
      expect(kitchenBulkDestination({ status, type: 'Delivery' }, 'finish')).toBe('entregue');
    }
  });

  it('finaliza os pedidos ativos de balcão, mesa e retirada como retirados', () => {
    for (const type of ['Balcão', 'Mesa', 'Retirada']) {
      expect(kitchenBulkDestination({ status: 'pronto', type }, 'finish')).toBe('retirado');
    }
    expect(kitchenBulkDestination({ status: 'cancelado', type: 'Mesa' }, 'finish')).toBeNull();
    expect(kitchenBulkDestination({ status: 'retirado', type: 'Mesa' }, 'finish')).toBeNull();
  });

  it('faz uma única chamada para marcar todos como prontos', async () => {
    rpc.mockResolvedValue({ data: 12, error: null });
    await expect(runKitchenBulkAction('ready')).resolves.toBe(12);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('bulk_advance_pdv_cashier_orders', { action: 'ready' });
  });

  it('faz uma única chamada para dar baixa em todos', async () => {
    rpc.mockResolvedValue({ data: 20, error: null });
    await expect(runKitchenBulkAction('finish')).resolves.toBe(20);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('bulk_advance_pdv_cashier_orders', { action: 'finish' });
  });
});
