import { describe, expect, it, vi, afterEach } from 'vitest';
import { newKitchenOrders, playOrderSound, unlockOrderSound, type AlertOrder } from '@/lib/order-alerts';
const order = (id: string, status = 'cozinha'): AlertOrder => ({ id, number: 12, status, items: [{ qty: 2, name: 'Espeto' }] });
afterEach(() => vi.unstubAllGlobals());
describe('Avisos de chegada', () => {
  it('avisa somente pedidos que entram na cozinha, sem duplicar atualizações', () => {
    expect(newKitchenOrders([order('antigo')], [order('antigo'), order('novo'), order('pago', 'pago')]).map(o => o.id)).toEqual(['novo']);
    expect(newKitchenOrders([order('novo')], [order('novo')])).toEqual([]);
  });
  it('avisa uma comanda aberta encaminhada à cozinha', () => {
    expect(newKitchenOrders([order('mesa', 'aberta')], [order('mesa')]).map(o => o.id)).toEqual(['mesa']);
  });
  it('gera o efeito sonoro após liberar áudio por interação', async () => {
    const start = vi.fn();
    const gain = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal('AudioContext', class { state = 'running'; currentTime = 0; destination = {}; createOscillator() { return { frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start, stop: vi.fn() }; } createGain() { return gain; } });
    expect(await unlockOrderSound()).toBe(true);
    expect(playOrderSound()).toBe(true);
    expect(start).toHaveBeenCalledTimes(3);
  });
});