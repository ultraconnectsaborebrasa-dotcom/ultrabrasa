import type { Order } from '@/lib/pdv-store';
import { totals } from '@/lib/pdv-store';
import privateKeyPem from '@/assets/qz-private-key.pem?raw';
import certificatePem from '@/assets/qz-certificate.pem?raw';

type QZ = {
 websocket: { connect: () => Promise<void>; disconnect: () => Promise<void>; isActive: () => boolean };
 printers: { find: () => Promise<string[]> };
 configs: { create: (name: string, options?: Record<string, unknown>) => unknown };
 print: (config: unknown, data: unknown[]) => Promise<void>;
 security: { setCertificatePromise: (fn: () => Promise<string>) => void; setSignaturePromise: (fn: (data: string) => Promise<string>) => void };
};
declare global { interface Window { qz?: QZ } }
const PREFIX = 'ultrabrasa-printer-';
const get = (key: string) => { try { return localStorage.getItem(PREFIX + key); } catch { return null; } };
const put = (key: string, value: string) => { try { localStorage.setItem(PREFIX + key, value); } catch { /* storage unavailable */ } };
const log = (...args: unknown[]) => { if (import.meta.env.DEV) console.info('[Printer]', ...args); };
export const printerPreferences = {
 get selectedPrinter() { return get('selectedPrinter') || ''; },
 set selectedPrinter(value: string) { put('selectedPrinter', value); },
 get autoPrintEnabled() { return get('autoPrintEnabled') !== 'false'; },
 set autoPrintEnabled(value: boolean) { put('autoPrintEnabled', String(value)); },
};
const printed = () => { try { return new Set<string>(JSON.parse(get('printedOrderIds') || '[]')); } catch { return new Set<string>(); } };
const pending = () => { try { return new Set<string>(JSON.parse(get('pendingOrderIds') || '[]')); } catch { return new Set<string>(); } };
export const pendingPrintIds = () => [...pending()];
const saveSet = (name: string, values: Set<string>) => put(name, JSON.stringify([...values]));
export const wasAutomaticallyPrinted = (id: string) => printed().has(id);
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
const WIDTH = 32;
const line = '='.repeat(WIDTH);
function wrap(value: unknown): string[] {
 const words = normalize(value).split(/\s+/).filter(Boolean);
 const lines: string[] = []; let current = '';
 for (const word of words) {
  if (word.length > WIDTH) { if (current) { lines.push(current); current = ''; } for (let i = 0; i < word.length; i += WIDTH) lines.push(word.slice(i, i + WIDTH)); continue; }
  if (current && current.length + word.length + 1 > WIDTH) { lines.push(current); current = word; } else current += (current ? ' ' : '') + word;
 }
 if (current) lines.push(current);
 return lines;
}
// Use apenas caracteres ASCII no valor monetário para evitar que a codificação
// da impressora térmica altere o símbolo da moeda ou os separadores decimais.
const money = (value: number) => {
 if (!Number.isFinite(value)) return '';
 const cents = Math.round((value + Math.sign(value) * Number.EPSILON) * 100);
 const sign = cents < 0 ? '-' : '';
 const absolute = Math.abs(cents);
 const whole = Math.floor(absolute / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
 const fraction = String(absolute % 100).padStart(2, '0');
 return sign + 'R$ ' + whole + ',' + fraction;
};
export function formatReceipt(order: Order, serviceFeePct: number): string {
 const date = new Date(order.createdAt);
 const sum = totals(order, serviceFeePct);
 const lines = [line, 'ULTRACONNECT', 'SABOR E BRASA', line, 'PEDIDO #' + order.number, date.toLocaleString('pt-BR'), line];
 if (order.customer) lines.push('CLIENTE', ...wrap(order.customer));
 if (order.tableNumber) lines.push('MESA ' + order.tableNumber);
 lines.push('TIPO: ' + normalize(order.type), line);
 for (const item of order.items) {
  lines.push(...wrap(item.qty + 'x ' + item.name), 'Unit.: ' + money(item.price), 'Item: ' + money(item.qty * item.price));
  if (item.note) lines.push('OBS ITEM:', ...wrap(item.note));
  lines.push('-'.repeat(WIDTH));
 }
 lines.push('SUBTOTAL: ' + money(sum.sub));
 if (order.discount) lines.push('DESCONTO: ' + money(order.discount));
 if (order.fee) lines.push('TAXA: ' + money(order.fee));
 if (order.serviceFee && sum.service) lines.push('SERVICO: ' + money(sum.service));
 lines.push(line, 'TOTAL: ' + money(sum.total), line);
 if (order.payments?.length) lines.push('PAGAMENTO: ' + order.payments.map(p => normalize(p.method)).join(', '));
 if (order.note) lines.push(line, '          OBS', line, ...wrap(order.note));
 lines.push(line, 'PEDIDO #' + order.number, '', '', '', '');
 return lines.join('\n') + '\n';
}
let qzLoader: Promise<QZ> | null = null;
async function api(): Promise<QZ> {
 if (typeof window === 'undefined') throw new Error('Impressão disponível apenas no computador.');
 if (window.qz) return window.qz;
 if (!qzLoader) qzLoader = new Promise<QZ>((resolve, reject) => {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.5/qz-tray.js';
  script.onload = () => window.qz ? resolve(window.qz) : reject(new Error('Biblioteca QZ indisponível.'));
  script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca QZ Tray.'));
  document.head.appendChild(script);
 }).catch(error => { qzLoader = null; throw error; });
 return qzLoader;
}
export async function connectPrinter() {
 log('Connecting QZ');
 const qz = await api();
 if (!qz.websocket.isActive()) await qz.websocket.connect();
 log('Connected');
}
export async function disconnectPrinter() { const qz = await api(); if (qz.websocket.isActive()) await qz.websocket.disconnect(); }
export const isPrinterConnected = () => Boolean(typeof window !== 'undefined' && window.qz?.websocket.isActive());
export async function listPrinters() {
 await connectPrinter();
 const names = await (await api()).printers.find();
 return [...names].sort((a, b) => Number(/mo-?5812|atomo|átomo/i.test(b)) - Number(/mo-?5812|atomo|átomo/i.test(a)));
}
type Job = { order: Order; pct: number; manual: boolean; force: boolean; resolve: () => void; reject: (error: unknown) => void };
const queue: Job[] = [];
let working = false;
async function drain() {
 if (working) return;
 working = true;
 try {
  while (queue.length) {
   const job = queue.shift()!;
   try {
    if (!job.manual && !job.force && wasAutomaticallyPrinted(job.order.id)) { job.resolve(); continue; }
    if (!printerPreferences.selectedPrinter) throw new Error('Selecione uma impressora nas configurações.');
    await connectPrinter();
    log('Printing:', job.order.number);
    const qz = await api();
    const config = qz.configs.create(printerPreferences.selectedPrinter);
    const receipt = formatReceipt(job.order, job.pct);
    await qz.print(config, [{ type: 'raw', format: 'plain', data: '\x1b@' + receipt }]);
    if (!job.manual) {
     const ids = printed(); ids.add(job.order.id); saveSet('printedOrderIds', ids);
     const waiting = pending(); waiting.delete(job.order.id); saveSet('pendingOrderIds', waiting);
    }
    log('Success:', job.order.number); job.resolve();
   } catch (error) {
    if (!job.manual) { const waiting = pending(); waiting.add(job.order.id); saveSet('pendingOrderIds', waiting); }
    log('Failed:', job.order.number); job.reject(error);
   }
  }
 } finally { working = false; }
}
export function printOrder(order: Order, serviceFeePct: number, options: { manual?: boolean; force?: boolean } = {}) {
 return new Promise<void>((resolve, reject) => {
  if (!options.manual && (queue.some(j => !j.manual && j.order.id === order.id) || (!options.force && wasAutomaticallyPrinted(order.id)))) { resolve(); return; }
  log('Queue order:', order.number);
  queue.push({ order, pct: serviceFeePct, manual: Boolean(options.manual), force: Boolean(options.force), resolve, reject });
  void drain();
 });
}
export async function testPrinter() {
 if (!printerPreferences.selectedPrinter) throw new Error('Selecione uma impressora.');
 await connectPrinter();
 const qz = await api();
 const date = new Date();
 await qz.print(qz.configs.create(printerPreferences.selectedPrinter), [{ type: 'raw', format: 'plain', data: '\x1b@' + [line, 'ULTRACONNECT', 'SABOR E BRASA', '', 'TESTE DE IMPRESSAO', '', 'Impressora:', printerPreferences.selectedPrinter, '', 'Conexao realizada com sucesso.', date.toLocaleString('pt-BR'), line, '', '', ''].join('\n') }]);
}
