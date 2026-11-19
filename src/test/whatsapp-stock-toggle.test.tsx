import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppRobotToggle } from '@/components/pdv/WhatsAppRobotToggle';

const { autoReply, stockExhausted } = vi.hoisted(() => ({ autoReply: vi.fn(), stockExhausted: vi.fn() }));
vi.mock('@/lib/whatsapp-robot-toggle.functions', () => ({ whatsappSetAutoReply: 'auto-reply', whatsappSetStockExhausted: 'stock-exhausted' }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: string) => fn === 'auto-reply' ? autoReply : stockExhausted }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('controles do robô e estoque esgotado', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ativa somente o aviso para novos contatos e mantém o robô ligado', async () => {
    const onChange = vi.fn();
    stockExhausted.mockResolvedValue({ stockExhausted: true });
    render(<WhatsAppRobotToggle enabled={false} stockExhausted={false} circuitPaused={false} circuitReason="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar aviso de estoque esgotado' }));
    await waitFor(() => expect(stockExhausted).toHaveBeenCalledWith({ data: { enabled: true } }));
    expect(onChange).toHaveBeenCalledWith({ enabled: true, stockExhausted: true, circuitPaused: false });
    expect(autoReply).not.toHaveBeenCalled();
  });

  it('Ativar robô encerra o modo esgotado e restaura o fluxo normal', async () => {
    const onChange = vi.fn();
    autoReply.mockResolvedValue({ enabled: true });
    render(<WhatsAppRobotToggle enabled stockExhausted circuitPaused={false} circuitReason="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar robô do WhatsApp' }));
    await waitFor(() => expect(autoReply).toHaveBeenCalledWith({ data: { enabled: true } }));
    expect(onChange).toHaveBeenCalledWith({ enabled: true, stockExhausted: false, circuitPaused: false });
  });

  it('mostra o bloqueio do WhatsApp e permite reativar o fluxo normal', async () => {
    const onChange = vi.fn();
    autoReply.mockResolvedValue({ enabled: true });
    render(<WhatsAppRobotToggle enabled stockExhausted={false} circuitPaused circuitReason="Configure a moeda da conta." onChange={onChange} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Configure a moeda da conta.');
    fireEvent.click(screen.getByRole('button', { name: 'Ativar robô do WhatsApp' }));
    await waitFor(() => expect(autoReply).toHaveBeenCalledWith({ data: { enabled: true } }));
    expect(onChange).toHaveBeenCalledWith({ enabled: true, stockExhausted: false, circuitPaused: false });
  });
});
