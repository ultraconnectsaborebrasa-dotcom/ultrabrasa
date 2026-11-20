import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatReceipt, printOrder, testPrinter } from '@/services/thermalPrinter';
import type { Order } from '@/lib/pdv-store';

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
    const payload = print.mock.calls[0]![1] as Array<{ data: string }>;
    expect(payload[0]!.data).toContain('PAPEL 80 MM / 42 COLUNAS');
    expect(payload[0]!.data).toContain('-'.repeat(42));
  });

  it('usa toda a área de 80 mm no modo direto ESC/POS', async () => {
    localStorage.setItem('ultrabrasa-printer-printMode', 'raw');
    const { print } = mockQz(['EPSON TM-T20 Receipt']);

    await testPrinter();

    const payload = print.mock.calls[0]![1] as Array<{ data: string }>;
    expect(payload[0]!.data).toContain('\x1dW\x40\x02');
    expect(payload[0]!.data).toContain('PAPEL 80 MM / 42 COLUNAS');
  });

  it('mantém a área de 58 mm na impressora menor', async () => {
    localStorage.setItem('ultrabrasa-printer-selectedPrinter', 'Atomo MO-5812');
    localStorage.setItem('ultrabrasa-printer-printerModel', 'thermal-58');
    localStorage.setItem('ultrabrasa-printer-printMode', 'raw');
    const { print } = mockQz(['Atomo MO-5812']);

    await testPrinter();

    const payload = print.mock.calls[0]![1] as Array<{ data: string }>;
    expect(payload[0]!.data).toContain('\x1dW\x80\x01');
    expect(payload[0]!.data).toContain('PAPEL 58 MM / 28 COLUNAS');
  });

  it('formata a comanda do pedido com 42 colunas na Epson', async () => {
    const { print } = mockQz(['EPSON TM-T20 Receipt']);
    const order: Order = {
      id: 'pedido-ficticio-80mm', number: 9999, type: 'Balcão', customer: 'Cliente teste',
      items: [{ uid: 'item-1', productId: 'produto-1', name: 'Marmita completa com arroz e farofa', price: 19.9, qty: 1, note: '' }],
      note: '', discount: 0, fee: 0, serviceFee: false, payments: [], status: 'aberta', createdAt: Date.now(),
    };

    await printOrder(order, 0, { manual: true });

    const payload = print.mock.calls[0]![1] as Array<{ data: string }>;
    expect(payload[0]!.data).toContain('1x Marmita completa com arroz e farofa');
    expect(payload[0]!.data).toContain('-'.repeat(42));
    expect(payload[0]!.data).toMatch(/TOTAL:\s+R\$ 19,90/);

    localStorage.setItem('ultrabrasa-printer-printMode', 'raw');
    print.mockClear();
    await printOrder(order, 0, { manual: true });
    const rawPayload = print.mock.calls[0]![1] as Array<{ data: string }>;
    expect(rawPayload[0]!.data).toMatch(/TOTAL:\s+R\$ 19,90/);
  });

  it('marca o cupom como pago no Pix usando o valor recebido', () => {
    const order: Order = {
      id: 'pedido-pix-pago', number: 1002, type: 'Balcão', customer: 'Cliente Pix', status: 'pronto',
      paymentStatus: 'pago', paidAt: Date.now(), createdAt: Date.now(), note: '', discount: 0, fee: 5, serviceFee: false,
      items: [{ uid: 'item-1', productId: 'marmita', name: 'Marmita completa', price: 19.9, qty: 1, note: '' }],
      payments: [{ method: 'Pix', amount: 24.9 }],
    };

    const paidReceipt = formatReceipt(order, 0, 42);
    expect(paidReceipt).toContain('PAGO NO PIX');
    expect(paidReceipt).toMatch(/TOTAL:\s+R\$ 24,90/);

    const pendingReceipt = formatReceipt({ ...order, paymentStatus: 'pendente', paidAt: undefined }, 0, 42);
    expect(pendingReceipt).not.toContain('PAGO NO PIX');
  });

  it('não envia o cupom a outra impressora quando a Epson selecionada está ausente', async () => {
    const { print } = mockQz(['Microsoft Print to PDF', 'Atomo MO-5812']);

    await expect(testPrinter()).rejects.toThrow('nenhum cupom foi enviado a outra impressora');
    expect(print).not.toHaveBeenCalled();
  });
});
