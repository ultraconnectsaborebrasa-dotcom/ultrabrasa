import { describe, it, expect, vi, afterEach } from 'vitest';
import { runAfterResponse } from './background';

const requestWith = (context?: { waitUntil: (task: Promise<unknown>) => void }) =>
  ({ runtime: { cloudflare: { context } } }) as unknown as Request;

afterEach(() => vi.restoreAllMocks());

describe('runAfterResponse', () => {
  it('entrega a tarefa à plataforma sem esperar por ela', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let held: Promise<unknown> | undefined;
    const waitUntil = vi.fn((task: Promise<unknown>) => { held = task; });
    let done = false;
    await runAfterResponse(requestWith({ waitUntil }), 'wa', async () => {
      await Promise.resolve();
      done = true;
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    await held;
    expect(done).toBe(true);
  });

  it('espera a tarefa quando a plataforma não oferece contexto de fundo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let done = false;
    await runAfterResponse(requestWith(), 'wa', async () => {
      await Promise.resolve();
      done = true;
    });
    expect(done).toBe(true);
  });

  it('não deixa uma falha da tarefa atrapalhar a resposta', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let held: Promise<unknown> | undefined;
    await expect(
      runAfterResponse(requestWith({ waitUntil: (task) => { held = task; } }), 'wa', async () => {
        throw new Error('falhou');
      }),
    ).resolves.toBeUndefined();
    await expect(held).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
  });
});
