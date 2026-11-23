import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourierManager } from '@/components/pdv/CourierManager';
import type { Courier } from '@/lib/delivery';

const { rpcMock, toastMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), toastMock: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: rpcMock } }));
vi.mock('sonner', () => ({ toast: toastMock }));

const active: Courier = { id: 'active-id', name: 'Mateus', phone: '', user_id: null, active: true };
const inactive: Courier = { id: 'inactive-id', name: 'João', phone: '', user_id: null, active: false };
const deleted: Courier = { id: 'deleted-id', name: 'Registro antigo', phone: '', user_id: null, active: false, deleted_at: '2026-11-23T13:00:00Z' };

describe('cadastro de entregadores', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockImplementation((name: string) => Promise.resolve(name === 'list_delivery_courier_accounts' ? { data: [], error: null } : { data: null, error: null }));
  });
  afterEach(cleanup);

  it('confirma a desativação e informa ao banco o entregador escolhido', async () => {
    const changed = vi.fn(async () => ({}));
    render(<CourierManager couriers={[active]} onChanged={changed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Desativar entregador Mateus' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('poderá ser reativado');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desativação' }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('set_delivery_courier_state', { p_courier_id: 'active-id', p_action: 'deactivate' }));
    expect(changed).toHaveBeenCalled();
  });

  it('confirma a exclusão sem apagar os registros antigos', async () => {
    render(<CourierManager couriers={[active]} onChanged={vi.fn(async () => ({}))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir entregador Mateus' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('relatórios antigos serão preservados');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('set_delivery_courier_state', { p_courier_id: 'active-id', p_action: 'delete' }));
  });

  it('mostra desativados sob comando, permite reativar e nunca lista excluídos', async () => {
    render(<CourierManager couriers={[active, inactive, deleted]} onChanged={vi.fn(async () => ({}))} />);
    expect(screen.queryByText('João')).toBeNull();
    expect(screen.queryByText('Registro antigo')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar desativados · 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reativar entregador João' }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('set_delivery_courier_state', { p_courier_id: 'inactive-id', p_action: 'activate' }));
    expect(screen.queryByText('Registro antigo')).toBeNull();
  });
});
