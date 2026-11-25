import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { androidLoginRequest, androidReturnIntent, androidSession, decodeAndroidBytes } from '@/lib/android-auth';
import { Brand } from '@/components/pdv/Brand';
import { GoogleSignInButton } from '@/components/pdv/GoogleSignInButton';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/android-login')({
  head: () => ({ meta: [
    { title: 'Entrar no aplicativo — Ultraconnect Entregas' },
    { name: 'description', content: 'Acesso seguro pelo Google ao aplicativo Ultraconnect Entregas.' },
    { property: 'og:title', content: 'Entrar no aplicativo — Ultraconnect Entregas' },
    { property: 'og:description', content: 'Continue com sua conta e retorne ao aplicativo de entregas.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  component: AndroidLogin,
});

const STORAGE = 'ultraconnect-android-login';
export function AndroidLogin() {
  const navigate = useNavigate();
  const initialized = useRef(false);
  const [request, setRequest] = useState<{ state: string; key: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const returning = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      try {
        const fragment = new URLSearchParams(window.location.hash.slice(1)).get('session');
        if (fragment) {
          // Clear credentials before any async operation; only the native WebView may restore them.
          window.history.replaceState(null, '', '/android-login');
          if (!/UltraconnectEntregas\/1\.3/.test(navigator.userAgent) || fragment.length > 20000) throw new Error('Abra novamente o login no aplicativo atualizado.');
          setBusy(true);
          const session = androidSession.parse(JSON.parse(new TextDecoder().decode(decodeAndroidBytes(fragment))));
          const { error } = await supabase.auth.setSession(session);
          if (error) throw error;
          await navigate({ to: '/', replace: true });
          return;
        }
        const params = new URLSearchParams(window.location.search);
        const incoming = androidLoginRequest.safeParse({ state: params.get('state'), key: params.get('key') });
        if (incoming.success) {
          sessionStorage.setItem(STORAGE, JSON.stringify({ ...incoming.data, expires: Date.now() + 300000, started: false }));
          window.history.replaceState(null, '', `/android-login${window.location.hash}`);
        }
        const stored = JSON.parse(sessionStorage.getItem(STORAGE) ?? 'null') as { state: string; key: string; expires: number; started: boolean } | null;
        if (!stored || stored.expires < Date.now()) throw new Error('Abra o aplicativo e toque em Continuar com Google para iniciar.');
        const valid = androidLoginRequest.parse(stored);
        setRequest(valid);
        if (stored.started) {
          // getSession waits for callback restoration; getUser then verifies it remotely.
          const { data: session } = await supabase.auth.getSession();
          if (session.session) {
            const { data, error } = await supabase.auth.getUser();
            if (error) throw error;
            setReady(Boolean(data.user));
          }
        }
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível continuar. Inicie novamente pelo aplicativo.'); }
      finally { setBusy(false); }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!request) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session) return;
      const stored = JSON.parse(sessionStorage.getItem(STORAGE) ?? 'null');
      if (!stored?.started || stored.expires < Date.now()) return;
      // Do not invoke auth methods inside its callback: they share the auth lock.
      window.setTimeout(() => {
        void supabase.auth.getUser().then(({ data: user, error }) => {
          if (!error && user.user) setReady(true);
        });
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [request]);

  useEffect(() => {
    if (!ready || !request || returning.current) return;
    returning.current = true;
    void returnToApp();
  }, [ready, request]);

  async function login() {
    if (!request) return;
    setBusy(true); setMessage('');
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE) ?? 'null');
      if (!stored || stored.expires < Date.now()) throw new Error('Login expirado. Comece novamente no aplicativo.');
      sessionStorage.setItem(STORAGE, JSON.stringify({ ...stored, started: true }));
      const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: `${window.location.origin}/android-login`, extraParams: { prompt: 'select_account' } });
      if (result.error) throw result.error;
      if (!result.redirected) {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw new Error('Não foi possível confirmar sua conta. Tente entrar novamente.');
        setReady(true);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível entrar com Google.'); }
    finally { setBusy(false); }
  }
  async function returnToApp() {
    if (!request || !ready) return;
    setBusy(true); setMessage('');
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE) ?? 'null');
      if (!stored?.started || stored.expires < Date.now()) throw new Error('Login expirado. Comece novamente no aplicativo.');
      const { data: user, error: userError } = await supabase.auth.getUser();
      if (userError || !user.user) throw new Error('Entre com Google antes de retornar ao aplicativo.');
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('A sessão expirou. Entre novamente.');
      const intent = await androidReturnIntent(request, data.session);
      window.location.assign(intent);
      setMessage('Se o Android pedir confirmação, escolha abrir Ultraconnect Entregas.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível abrir o aplicativo.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
    <Brand large />
    <p className="mt-8 text-xs font-semibold uppercase text-primary">Ultraconnect Entregas</p>
    <h1 className="mt-2 text-3xl font-bold">{ready ? 'Conta conectada' : 'Entrar no aplicativo'}</h1>
    <p className="mb-8 mt-3 text-sm text-muted-foreground">{ready ? 'Seu acesso está pronto para continuar no aplicativo.' : 'Use a mesma conta Google liberada pela loja.'}</p>
    {ready ? <><CheckCircle2 className="mb-5 text-success" size={32} /><Button className="h-12 w-full" disabled={busy} onClick={() => void returnToApp()}><Smartphone size={18} />Voltar ao aplicativo</Button></> : <GoogleSignInButton disabled={busy || !request} onClick={() => void login()} />}
    {busy && <LoaderCircle aria-label="Conectando" className="mx-auto mt-4 animate-spin text-primary" />}
    {message && <p role="status" className="mt-5 text-sm text-warning">{message}</p>}
  </main>;
}