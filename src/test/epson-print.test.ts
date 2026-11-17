import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testPrinter } from '@/services/thermalPrinter';

const security = {
  setCertificatePromise: vi.fn(),
  setSignaturePromise: vi.fn(),
};

function mockQz(printers: string[]) {
  const create = vi.fn((_name: string, options?: Record<string, unknown>) => ({ options }));
  const print = vi.fn().mockResolvedValue(undefined);
  window.qz = {
    websocket: { connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn(), isActive: () => true },
    printers: { find: vi.fn().mockResolvedValue(printers) },
    configs: { create },
    print,
    security,
  };
  return { create, print };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ultrabrasa-printer-selectedPrinter', 'EPSON TM-T20 Receipt');
  localStorage.setItem('ultrabrasa-printer-printerModel', 'epson-tm-t20');
});

afterEach(() => {
  delete window.qz;
  localStorage.clear();
  vi.clearAllMocks();
});

describe('impressão na Epson física', () => {
  it('usa exatamente a Epson selecionada, papel de 80 mm e imagem compatível com o driver', async () => {
    const { create, print } = mockQz(['Microsoft Print to PDF', 'EPSON TM-T20 Receipt']);

    await testPrinter();

    expect(create).toHaveBeenCalledWith('EPSON TM-T20 Receipt', expect.objectContaining({
      size: { width: 80 },
      rasterize: true,
    }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('não envia o cupom a outra impressora quando a Epson selecionada está ausente', async () => {
    const { print } = mockQz(['Microsoft Print to PDF', 'Atomo MO-5812']);

    await expect(testPrinter()).rejects.toThrow('nenhum cupom foi enviado a outra impressora');
    expect(print).not.toHaveBeenCalled();
  });
});
