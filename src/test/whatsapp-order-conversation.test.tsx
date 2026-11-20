import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppOrderConversation } from '@/components/pdv/WhatsAppOrderConversation';

const writeText = vi.fn().mockResolvedValue(undefined);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        maybeSingle: async () => ({ data: table === 'whatsapp_conversations' ? { name: 'Maria Silva', assigned_name: 'Caixa', automation_paused: true } : null, error: null }),
        limit: async () => ({ data: table === 'whatsapp_messages' ? [
          { id: '2', direction: 'out', kind: 'text', body: 'Pode confirmar o endereço?', provider_at: '2026-11-20T12:02:00Z' },
          { id: '1', direction: 'in', kind: 'text', body: 'Rua das Flores, 55, Centro. Referência: mercado.', provider_at: '2026-11-20T12:01:00Z' },
        ] : [], error: null }),
      };
      return query;
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('conversa de apoio ao pedido manual', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('mostra o nome do perfil, a pausa do robô e copia nome e endereço sem preencher o pedido', async () => {
    render(<WhatsAppOrderConversation phone="5573999990000" onBack={() => {}} onClose={() => {}} />);

    expect(await screen.findByRole('heading', { name: 'Maria Silva' })).toBeTruthy();
    expect(screen.getByText('Robô pausado nesta conversa')).toBeTruthy();
    expect(screen.getByText('Rua das Flores, 55, Centro. Referência: mercado.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Copiar nome do perfil' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Maria Silva'));

    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem do cliente: Rua das Flores, 55, Centro. Referência: mercado.' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Rua das Flores, 55, Centro. Referência: mercado.'));
  });
});
