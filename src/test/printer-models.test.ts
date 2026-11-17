import { describe, expect, it } from 'vitest';
import { isEpsonTmT20, paperWidthForPrinter, parsePrinterModel, preferredPhysicalPrinter, sortPrinters } from '@/lib/printer-models';

describe('seleção da Epson TM-T20', () => {
  it('reconhece os nomes usados pelo driver da Epson no Windows', () => {
    expect(isEpsonTmT20('EPSON TM-T20 Receipt')).toBe(true);
    expect(isEpsonTmT20('EPSON TM-T20III USB')).toBe(true);
    expect(isEpsonTmT20('Atomo MO-5812')).toBe(false);
  });

  it('prioriza a Epson sobre impressoras virtuais e outras térmicas', () => {
    expect(sortPrinters(['Microsoft Print to PDF', 'Atomo MO-5812', 'EPSON TM-T20 Receipt'])[0]).toBe('EPSON TM-T20 Receipt');
  });

  it('usa papel de 80 mm para a Epson e preserva 58 mm na Atomo', () => {
    expect(paperWidthForPrinter('EPSON TM-T20 Receipt', 'auto')).toBe(80);
    expect(paperWidthForPrinter('Atomo MO-5812', 'auto')).toBe(58);
    expect(paperWidthForPrinter('Impressora USB', 'epson-tm-t20')).toBe(80);
  });

  it('recupera somente modelos de impressora válidos', () => {
    expect(parsePrinterModel('epson-tm-t20')).toBe('epson-tm-t20');
    expect(parsePrinterModel('modelo-desconhecido')).toBe('auto');
  });

  it('escolhe a Epson física e nunca substitui por PDF', () => {
    expect(preferredPhysicalPrinter(['Microsoft Print to PDF', 'EPSON TM-T20 Receipt'])).toBe('EPSON TM-T20 Receipt');
    expect(preferredPhysicalPrinter(['Microsoft Print to PDF'])).toBe('');
  });
});
