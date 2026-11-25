import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DeletePersonDialog } from '@/components/pdv/DeletePersonDialog';
const { rpc, remove } = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@/lib/person-purge.functions', () => ({ deletePersonPermanently: remove, completePersonPurge: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
afterEach(() => { cleanup();vi.clearAllMocks(); });
const preview = { name: 'Cliente', orders: 3, deliveries: 2, receipts: 1, messages: 4, blocked: false };
describe('Exclusão definitiva protegida', () => {
  it('não exclui sem a confirmação digitada', async () => {
    rpc.mockResolvedValue({ data: preview, error: null });
    render(<DeletePersonDialog kind="customer" id="customer" name="Cliente" onClose={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Excluir definitivamente' })).toBeDisabled());
    fireEvent.change(screen.getByLabelText('Confirmação de exclusão definitiva'), { target: { value: 'EXCLUIR' } });
    expect(screen.getByRole('button', { name: 'Excluir definitivamente' })).toBeEnabled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('envia somente a pessoa confirmada', async () => {
    rpc.mockResolvedValue({ data: preview, error: null });remove.mockResolvedValue({ completed: true, cleanupId: 'job' });
    const onDeleted=vi.fn();render(<DeletePersonDialog kind="staff" id="seller" name="Atendente" onClose={vi.fn()} onDeleted={onDeleted} />);
    await waitFor(() => expect(screen.getByLabelText('Confirmação de exclusão definitiva')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Confirmação de exclusão definitiva'), { target: { value: 'EXCLUIR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir definitivamente' }));
    await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith({ data: { kind: 'staff', id: 'seller', confirmation: 'EXCLUIR' } }));
    expect(onDeleted).toHaveBeenCalledOnce();
  });
  it('operações em andamento bloqueiam a exclusão', async () => {
    rpc.mockResolvedValue({ data: { ...preview, blocked: true }, error: null });
    render(<DeletePersonDialog kind="courier" id="courier" name="Entregador" onClose={vi.fn()} onDeleted={vi.fn()} />);
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Confirmação de exclusão definitiva')).toBeDisabled();expect(remove).not.toHaveBeenCalled();
  });
});