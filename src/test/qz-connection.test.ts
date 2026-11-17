import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectPrinter } from '@/services/thermalPrinter';

const security = {
  setCertificatePromise: vi.fn(),
  setSignaturePromise: vi.fn(),
};

afterEach(() => {
  delete window.qz;
  vi.clearAllMocks();
});

describe('conexão com o QZ Tray', () => {
  it('tenta novamente e explica como abrir o QZ Tray quando todas as portas falham', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('Unable to establish connection with QZ'));
    window.qz = {
      websocket: { connect, disconnect: vi.fn(), isActive: () => false },
      printers: { find: vi.fn() }, configs: { create: vi.fn() }, print: vi.fn(), security,
    };

    await expect(connectPrinter()).rejects.toThrow('Abra o QZ Tray no Windows');
    expect(connect).toHaveBeenCalledWith({ retries: 1, delay: 1 });
  });

  it('não abre outra conexão quando o QZ Tray já está ativo', async () => {
    const connect = vi.fn();
    window.qz = {
      websocket: { connect, disconnect: vi.fn(), isActive: () => true },
      printers: { find: vi.fn() }, configs: { create: vi.fn() }, print: vi.fn(), security,
    };

    await expect(connectPrinter()).resolves.toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
  });
});
