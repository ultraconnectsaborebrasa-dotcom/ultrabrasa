import { beforeEach, describe, expect, it, vi } from 'vitest';
import { kitchenBulkDestination, runKitchenBulkAction } from '@/lib/kitchen-bulk';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

beforeEach(() => rpc.mockReset());

describe('Baixa da cozinha em lote', () => {
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
