import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AndroidLogin } from '@/routes/android-login';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), getSession: vi.fn(), getUser: vi.fn(), setSession: vi.fn(), intent: vi.fn(),
  callback: null as null | ((event: string, session: unknown) => void),
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({ ...await importOriginal<typeof import('@tanstack/react-router')>(), useNavigate: () => mocks.navigate }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: mocks.getSession, getUser: mocks.getUser, setSession: mocks.setSession,
  onAuthStateChange: (callback: (event: string, session: unknown) => void) => { mocks.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
} } }));
vi.mock('@/integrations/lovable', () => ({ lovable: { auth: { signInWithOAuth: vi.fn() } } }));
vi.mock('@/lib/android-auth', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/android-auth')>(), androidReturnIntent: mocks.intent }));
vi.mock('@/components/pdv/Brand', () => ({ Brand: () => null }));

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); mocks.callback = null;
  window.history.replaceState(null, '', '/android-login');
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'test-access-token', refresh_token: 'test-refresh-token' } } });
  mocks.intent.mockResolvedValue('/android-login#encrypted-test-return');
});
afterEach(cleanup);
const store = (expires = Date.now() + 300000) => sessionStorage.setItem('ultraconnect-android-login', JSON.stringify({ state: 'a'.repeat(64), key: 'b'.repeat(392), expires, started: true }));

describe('retorno de login Google no aplicativo', () => {
  it('espera a sessão restaurada, verifica a conta e tenta retornar automaticamente', async () => {
    store(); render(<AndroidLogin />);
    await waitFor(() => expect(mocks.intent).toHaveBeenCalledTimes(1));
    expect(mocks.getSession).toHaveBeenCalled();
    expect(mocks.getUser).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Voltar ao aplicativo' })).toBeInTheDocument();
  });
  it('reconhece a sessão que chega depois da primeira leitura', async () => {
    store(); mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    render(<AndroidLogin />);
    await waitFor(() => expect(mocks.callback).not.toBeNull());
    expect(mocks.intent).not.toHaveBeenCalled();
    mocks.callback?.('SIGNED_IN', { access_token: 'test-access-token' });
    await waitFor(() => expect(mocks.intent).toHaveBeenCalledTimes(1));
  });
  it('não transfere sessão quando o vínculo com o aparelho já expirou', async () => {
    store(Date.now() - 1); render(<AndroidLogin />);
    await screen.findByRole('status');
    expect(mocks.intent).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it('não transfere sessão cuja conta não foi verificada', async () => {
    store(); mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    render(<AndroidLogin />);
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    expect(mocks.intent).not.toHaveBeenCalled();
  });
});