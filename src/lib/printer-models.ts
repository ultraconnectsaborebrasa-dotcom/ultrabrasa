export type PrinterModel = 'auto' | 'thermal-58' | 'epson-tm-t20' | 'thermal-80';

export function parsePrinterModel(value: string | null): PrinterModel {
  return value === 'thermal-58' || value === 'epson-tm-t20' || value === 'thermal-80' ? value : 'auto';
}

export function isEpsonTmT20(name: string): boolean {
  return /(?:epson[^\n]*tm[\s-]*t20|tm[\s-]*t20)/i.test(name);
}

export function paperWidthForPrinter(name: string, model: PrinterModel): 58 | 80 {
  if (model === 'thermal-58') return 58;
  if (model === 'thermal-80' || model === 'epson-tm-t20') return 80;
  return isEpsonTmT20(name) || /80\s*mm|pos-?80|tm-?t88/i.test(name) ? 80 : 58;
}

const THERMAL = /mo-?5812|atomo|átomo|pos-?58|pos-?80|thermal|t[ée]rmica|58mm|80mm|bluetooth|bt-?printer/i;
const VIRTUAL = /pdf|xps|onenote|fax|anydesk|send to/i;
export const isVirtualPrinter = (name: string) => VIRTUAL.test(name);

function rank(name: string): number {
  return (isEpsonTmT20(name) ? 4 : THERMAL.test(name) ? 2 : 0) - (VIRTUAL.test(name) ? 1 : 0);
}

export function sortPrinters(names: string[]): string[] {
  return [...names].sort((a, b) => rank(b) - rank(a));
}
