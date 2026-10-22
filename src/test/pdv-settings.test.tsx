import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { getState, replaceState, updateDraft } from '@/lib/pdv-store';
import { kitchenTone, validateSettings } from '@/lib/pdv-settings';
import { SettingsView } from '@/components/pdv/SettingsView';

vi.mock('@/lib/pdv-cloud', () => ({ useSyncStatus: () => 'live' }));
const original = structuredClone(getState());
afterEach(() => { cleanup(); replaceState(structuredClone(original)); });

describe('Configurações do administrador', () => {
  it('salva a preferência de serviço e aplica apenas aos próximos pedidos de mesa', () => {
    render(<SettingsView goAdmin={() => {}}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Vendas e taxas' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Aplicar serviço ao selecionar Mesa' }));
    expect(getState().settings.autoServiceOnTable).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(getState().settings.autoServiceOnTable).toBe(false);
    updateDraft({ type: 'Mesa' });
    expect(getState().draft.serviceFee).toBe(false);
  });
  it('descarta alterações sem mudar as preferências compartilhadas', () => {
    render(<SettingsView goAdmin={() => {}}/>);
    fireEvent.change(screen.getByLabelText('Nome da loja'), { target: { value: 'Outra loja' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(getState().settings.storeName).toBe(original.settings.storeName);
    expect((screen.getByLabelText('Nome da loja') as HTMLInputElement).value).toBe(original.settings.storeName);
  });
  it('mantém o serviço automático para snapshots anteriores', () => {
    updateDraft({ type: 'Mesa' });
    expect(getState().draft.serviceFee).toBe(true);
  });
  it('usa os tempos de alerta definidos pelo administrador', () => {
    const settings = { ...original.settings, kitchenWarningMinutes: 5, kitchenLateMinutes: 12 };
    expect(kitchenTone(6, settings)).toBe('border-warning');
    expect(kitchenTone(13, settings)).toBe('border-destructive');
    expect(validateSettings({ ...settings, kitchenLateMinutes: 5 })).not.toBeNull();
  });
  it('não permite remover todas as formas de pagamento', () => {
    expect(validateSettings({ ...original.settings, paymentMethods: [] })).not.toBeNull();
  });
  it('rejeita taxas negativas e desconto maior que 100%', () => {
    expect(validateSettings({ ...original.settings, deliveryFee: -1 })).not.toBeNull();
    expect(validateSettings({ ...original.settings, maxDiscountPct: 101 })).not.toBeNull();
  });
});