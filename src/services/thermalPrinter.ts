import type { Order } from '@/lib/pdv-store';
import { totals } from '@/lib/pdv-store';
import privateKeyPem from '@/assets/qz-private-key.txt?raw';
import certificatePem from '@/assets/qz-certificate.txt?raw';

type QZ = {
 websocket: { connect: () => Promise<void>; disconnect: () => Promise<void>; isActive: () => boolean };
 printers: { find: () => Promise<string[]> };
 configs: { create: (name: string, options?: Record<string, unknown>) => unknown };
 print: (config: unknown, data: unknown[]) => Promise<void>;
 security: { setCertificatePromise: (fn: () => Promise<string>) => void; setSignaturePromise: (fn: (data: string) => Promise<string>) => void; setSignatureAlgorithm?: (alg: string) => void };
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
 // 'driver' imprime pelo driver do Windows (funciona com qualquer impressora instalada);
 // 'raw' envia comandos ESC/POS direto (só funciona se o driver aceitar dados brutos).
 get printMode(): 'driver' | 'raw' { return get('printMode') === 'raw' ? 'raw' : 'driver'; },
 set printMode(value: 'driver' | 'raw') { put('printMode', value); },
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
// Assinatura digital das requisições QZ Tray: com certificado + assinatura,
// o QZ Tray não abre a janela de autorização a cada impressão.
let signingKey: Promise<CryptoKey> | null = null;
function importSigningKey(): Promise<CryptoKey> {
 if (!signingKey) {
  const body = privateKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bytes = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  // QZ Tray valida a assinatura em SHA1 por padrão; assinar com outro algoritmo invalida a impressão.
  signingKey = crypto.subtle.importKey('pkcs8', bytes.buffer as ArrayBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['sign']);
 }
 return signingKey;
}
let securityApplied = false;
async function applySecurity(qz: QZ): Promise<void> {
 if (securityApplied) return;
 qz.security.setCertificatePromise(() => Promise.resolve(certificatePem));
 qz.security.setSignaturePromise(async (toSign: string) => {
  const key = await importSigningKey();
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign)));
  let binary = '';
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
 });
 securityApplied = true;
}
let qzLoader: Promise<QZ> | null = null;
async function api(): Promise<QZ> {
 if (typeof window === 'undefined') throw new Error('Impressão disponível apenas no computador.');
 if (window.qz) { await applySecurity(window.qz); return window.qz; }
 if (!qzLoader) qzLoader = new Promise<QZ>((resolve, reject) => {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.5/qz-tray.js';
  script.onload = () => window.qz ? resolve(window.qz) : reject(new Error('Biblioteca QZ indisponível.'));
  script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca QZ Tray.'));
  document.head.appendChild(script);
 }).catch(error => { qzLoader = null; throw error; });
 const qz = await qzLoader;
 await applySecurity(qz);
 return qz;
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
 return [...names].sort((a, b) => rank(b) - rank(a));
}
const THERMAL = /mo-?5812|atomo|átomo|pos-?58|pos-?80|thermal|t[ée]rmica|58mm|80mm|bluetooth|bt-?printer/i;
const VIRTUAL = /pdf|xps|onenote|fax|anydesk|send to/i;
const rank = (name: string) => (THERMAL.test(name) ? 2 : 0) - (VIRTUAL.test(name) ? 1 : 0);
// Escolhe automaticamente a impressora (prioriza a térmica MO-5812) quando nenhuma foi salva.
async function ensurePrinter() {
 const names = await listPrinters();
 const saved = printerPreferences.selectedPrinter;
 if (saved && names.includes(saved)) return saved;
 const [first] = names;
 if (!first) throw new Error('Nenhuma impressora encontrada no computador.');
 if (VIRTUAL.test(first)) throw new Error('A impressora térmica não foi encontrada no Windows. Ligue e pareie a impressora e tente novamente.');
 printerPreferences.selectedPrinter = first;
 return first;
}
// Evita que uma impressão travada (ex.: janela de permissão do QZ ignorada) bloqueie a fila.
function withTimeout<T>(promise: Promise<T>, ms = 20000) {
 return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('A impressora não respondeu. Verifique o QZ Tray e permita a impressão.')), ms))]);
}
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Envia o texto do cupom. No modo 'driver' o Windows desenha o cupom pelo driver da impressora,
// o que evita o problema de "imprime sem erro mas não sai nada" em impressoras Bluetooth.
async function sendText(qz: QZ, printerName: string, text: string) {
 if (printerPreferences.printMode === 'raw') {
  const config = qz.configs.create(printerName, { encoding: 'CP437' });
  return qz.print(config, [{ type: 'raw', format: 'command', flavor: 'plain', data: '\x1b@' + text + '\n\n\n\x1dV\x42\x00' }]);
 }
 const config = qz.configs.create(printerName, { units: 'mm', size: { width: 48 }, margins: { top: 0, right: 0, bottom: 0, left: 0 }, scaleContent: true, rasterize: false, colorType: 'blackwhite' });
 const html = '<html><body style="margin:0;padding:0"><pre style="margin:0;font-family:\'Courier New\',monospace;font-size:9pt;font-weight:bold;line-height:1.15;white-space:pre-wrap;color:#000">' + escapeHtml(text) + '</pre></body></html>';
 return qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]);
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
    await connectPrinter();
    const printerName = await ensurePrinter();
    log('Printing:', job.order.number, printerName, printerPreferences.printMode);
    await withTimeout(sendText(await api(), printerName, formatReceipt(job.order, job.pct)));
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
 await connectPrinter();
 const printerName = await ensurePrinter();
 const qz = await api();
 const date = new Date();
 await withTimeout(sendText(qz, printerName, [line, 'ULTRACONNECT', 'SABOR E BRASA', '', 'TESTE DE IMPRESSAO', '', 'Impressora:', printerPreferences.selectedPrinter, '', 'Conexao realizada com sucesso.', date.toLocaleString('pt-BR'), line, '', '', ''].join('\n')));
}
