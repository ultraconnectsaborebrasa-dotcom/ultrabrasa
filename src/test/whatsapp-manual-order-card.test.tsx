import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppManualOrderCard } from '@/components/pdv/WhatsAppManualOrderCard';

describe('pedido manual pelo WhatsApp', () => {
  afterEach(cleanup);
  it('abre o pedido em branco, sem preencher dados automaticamente', () => {
    const build = vi.fn();
    render(<WhatsAppManualOrderCard phone="5573999990000" onBuildOrder={build} />);
    fireEvent.click(screen.getByRole('button', { name: 'Montar pedido' }));
    expect(build).toHaveBeenCalledWith({ phone: '5573999990000', customer: '', type: null, delivery: undefined, paymentLabel: '' });
  });
});
