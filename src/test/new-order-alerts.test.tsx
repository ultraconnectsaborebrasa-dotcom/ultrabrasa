import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewOrderAlerts } from '@/components/pdv/NewOrderAlerts';
import type { AlertOrder } from '@/lib/order-alerts';

const order: AlertOrder = { id: 'pedido-1', number: 42, status: 'cozinha', type: 'Delivery', items: [{ qty: 1, name: 'Marmita' }] };

describe('Toque único de pedido', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('toca uma vez por chegada, sem repetir durante preparo ou atualizações', async () => {
    const start = vi.fn();
    vi.stubGlobal('AudioContext', class {
      state = 'running';
      currentTime = 0;
      destination = {};
      async resume() { this.state = 'running'; }
      createOscillator() {
        return { type: 'square', frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start, stop: vi.fn() };
      }
      createGain() {
        return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      }
    });
    const onOpen = vi.fn();
    const { rerender } = render(<NewOrderAlerts orders={[]} onOpen={onOpen}/>);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'a' });
      await Promise.resolve();
    });
    rerender(<NewOrderAlerts orders={[order]} onOpen={onOpen}/>);
    expect(start).toHaveBeenCalledTimes(8);

    act(() => { vi.advanceTimersByTime(12_000); });
    expect(start).toHaveBeenCalledTimes(8);

    rerender(<NewOrderAlerts orders={[{ ...order, items: [{ qty: 2, name: 'Marmita' }] }]} onOpen={onOpen}/>);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(start).toHaveBeenCalledTimes(8);

    const second = { ...order, id: 'pedido-2', number: 43 };
    rerender(<NewOrderAlerts orders={[order, second]} onOpen={onOpen}/>);
    expect(start).toHaveBeenCalledTimes(16);

    rerender(<NewOrderAlerts orders={[{ ...order, status: 'pronto' }, second]} onOpen={onOpen}/>);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(start).toHaveBeenCalledTimes(16);

    fireEvent.click(screen.getByRole('button', { name: 'Ver na cozinha' }));
    expect(onOpen).toHaveBeenCalledOnce();
    act(() => { vi.advanceTimersByTime(24_000); });
    expect(start).toHaveBeenCalledTimes(16);
  });
});
