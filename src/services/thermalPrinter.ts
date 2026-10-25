import type { Order } from '@/lib/pdv-store';
import { totals } from '@/lib/pdv-store';
import { addressText, type Delivery } from '@/lib/delivery';
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
 get kitchenPrinter() { return get('kitchenPrinter') || ''; },
 set kitchenPrinter(value: string) { put('kitchenPrinter', value); },
 get cashierPrinter() { return get('cashierPrinter') || ''; },
 set cashierPrinter(value: string) { put('cashierPrinter', value); },
 get printMode(): 'driver' | 'raw' { return get('printMode') === 'raw' ? 'raw' : 'driver'; },
 set printMode(value: 'driver' | 'raw') { put('printMode', value); },
};
const printed = () => { try { return new Set<string>(JSON.parse(get('printedOrderIds') || '[]')); } catch { return new Set<string>(); } };
const pending = () => { try { return new Set<string>(JSON.parse(get('pendingOrderIds') || '[]')); } catch { return new Set<string>(); } };
export const pendingPrintIds = () => [...pending()];
const saveSet = (name: string, values: Set<string>) => put(name, JSON.stringify([...values]));
export const wasAutomaticallyPrinted = (id: string) => printed().has(id);
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
// Largura conservadora para a Atomo MO-5812 (58 mm, ~48 mm imprimíveis): 28 caracteres na fonte normal.
const WIDTH = 28;
const line = '-'.repeat(WIDTH);
const center = (value: string) => { const text = normalize(value).slice(0, WIDTH); return ' '.repeat(Math.floor((WIDTH - text.length) / 2)) + text; };
const pair = (label: string, value: string) => { const gap = WIDTH - label.length - value.length; return gap >= 1 ? label + ' '.repeat(gap) + value : [label, '  ' + value].join('\n'); };
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
 const lines = [center('ULTRACONNECT'), center('SABOR E BRASA'), line, center('PEDIDO #' + order.number), line,
  'DATA: ' + date.toLocaleDateString('pt-BR'), 'HORA: ' + date.toLocaleTimeString('pt-BR'), line, ...wrap('TIPO: ' + String(order.type).toUpperCase())];
 if (order.tableNumber) lines.push('MESA: ' + order.tableNumber);
 if (order.customer) lines.push(...wrap('CLIENTE: ' + order.customer));
 lines.push(line);
 for (const item of order.items) {
  lines.push(...wrap(item.qty + 'x ' + item.name));
  if (item.note) lines.push(...wrap('OBS: ' + item.note));
  lines.push('', pair('Preco unit.:', money(item.price)), pair('Subtotal:', money(item.qty * item.price)), line);
 }
 if (order.discount || order.fee || (order.serviceFee && sum.service)) {
  lines.push(pair('SUBTOTAL:', money(sum.sub)));
  if (order.discount) lines.push(pair('DESCONTO:', '-' + money(order.discount)));
  if (order.fee) lines.push(pair('TAXA:', money(order.fee)));
  if (order.serviceFee && sum.service) lines.push(pair('SERVICO:', money(sum.service)));
 }
 lines.push(pair('TOTAL:', money(sum.total)), line);
 if (order.payments?.length) lines.push(...wrap('PAGAMENTO: ' + order.payments.map(p => p.method).join(', ')), line);
 if (order.note) lines.push(...wrap('OBS: ' + order.note), line);
 lines.push(center('FIM DO PEDIDO'), '', '', '', '');
 return lines.join('\n') + '\n';
}
// Cupom de entrega: destaca o endereço completo para o entregador, sem preço por item
// (o painel de entregas não recebe preço unitário, apenas o total do pedido).
export function formatDeliveryTicket(delivery: Delivery): string {
 const date = new Date(delivery.created_at);
 const lines = [center('ULTRACONNECT'), center('SABOR E BRASA'), line, center('DELIVERY #' + delivery.number), line,
  'DATA: ' + date.toLocaleDateString('pt-BR'), 'HORA: ' + date.toLocaleTimeString('pt-BR'), line];
 if (delivery.customer) lines.push(...wrap('CLIENTE: ' + delivery.customer));
 if (delivery.phone) lines.push(...wrap('WHATSAPP: ' + delivery.phone));
 lines.push(line, center('ENTREGAR EM:'), ...wrap(addressText(delivery.address)));
 if (delivery.address.reference) lines.push(...wrap('REF: ' + delivery.address.reference));
 lines.push(line);
 for (const item of delivery.items) {
  lines.push(...wrap(item.qty + 'x ' + item.name));
  if (item.note) lines.push(...wrap('OBS: ' + item.note));
 }
 lines.push(line);
 if (delivery.total !== null) lines.push(pair('TOTAL:', money(delivery.total)));
 lines.push(...wrap('PAGAMENTO NA ENTREGA: ' + delivery.payment_method));
 if (delivery.due !== null) lines.push(pair('A RECEBER:', money(delivery.due)));
 if ((delivery.change ?? 0) > 0) lines.push(pair('TROCO PARA:', money(delivery.change ?? 0)));
 lines.push(line, center('FIM DO PEDIDO'), '', '', '', '');
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
 // O QZ Tray decide como chamar estas funções pelo nome do construtor ("AsyncFunction").
 // Funções comuns são tratadas como resolver (resolve, reject); por isso usamos exatamente esse formato,
 // que não depende de como o build transforma funções async.
 const setCert = qz.security.setCertificatePromise as unknown as (fn: (resolve: (v: string) => void, reject: (e: unknown) => void) => void) => void;
 setCert((resolve) => resolve(certificatePem));
 const setSign = qz.security.setSignaturePromise as unknown as (fn: (toSign: string) => (resolve: (v: string) => void, reject: (e: unknown) => void) => void) => void;
 setSign((toSign: string) => (resolve, reject) => {
  importSigningKey()
   .then(key => crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign)))
   .then(buffer => { let binary = ''; for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte); resolve(btoa(binary)); })
   .catch(reject);
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
 const found: unknown = await (await api()).printers.find();
 const names = Array.isArray(found) ? found.filter((n): n is string => typeof n === 'string' && n.length > 0) : typeof found === 'string' && found ? [found] : [];
 return [...names].sort((a, b) => rank(b) - rank(a));
}
const THERMAL = /mo-?5812|atomo|átomo|pos-?58|pos-?80|thermal|t[ée]rmica|58mm|80mm|bluetooth|bt-?printer/i;
const VIRTUAL = /pdf|xps|onenote|fax|anydesk|send to/i;
const rank = (name: string) => (THERMAL.test(name) ? 2 : 0) - (VIRTUAL.test(name) ? 1 : 0);
// Escolhe automaticamente a impressora (prioriza a térmica MO-5812) quando nenhuma foi salva.
export type PrintTarget = 'kitchen' | 'cashier';
async function ensurePrinter(target?: PrintTarget) {
 const names = await listPrinters();
 const specific = target === 'kitchen' ? printerPreferences.kitchenPrinter : target === 'cashier' ? printerPreferences.cashierPrinter : '';
 if (specific) { if (names.includes(specific)) return specific; throw new Error(`Impressora "${specific}" não encontrada. Verifique se está ligada e conectada.`); }
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
 if (!printerName) throw new Error('Nenhuma impressora configurada. Abra Ajustes → Impressora térmica.');
 if (!qz.websocket.isActive()) throw new Error('QZ Tray não está conectado neste computador. Abra o QZ Tray e tente novamente.');
 if (!text.trim()) throw new Error('Não há conteúdo para imprimir.');
 if (printerPreferences.printMode === 'raw') {
  const config = qz.configs.create(printerName, { encoding: 'CP437' });
  return qz.print(config, [{ type: 'raw', format: 'command', flavor: 'plain', data: '\x1b@' + '\x1bM\x00' + '\x1b!\x00' + '\x1d!\x00' + '\x1dL\x00\x00' + '\x1dW\x80\x01' + '\x1b$\x00\x00' + '\x1ba\x00' + text + '\n\n\n' }]);
 }
 const config = qz.configs.create(printerName, { units: 'mm', size: { width: 58 }, orientation: 'portrait', interpolation: 'nearest-neighbor', margins: { top: 0, right: 5, bottom: 0, left: 5 }, scaleContent: true, rasterize: false, colorType: 'blackwhite' });
 const html = '<html><body style="margin:0;padding:0"><pre style="margin:0;font-family:\'Courier New\',monospace;font-size:8pt;font-weight:bold;line-height:1.25;white-space:pre;color:#000">' + escapeHtml(text) + '</pre></body></html>';
 return qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]);
}
type Job = { target: PrintTarget | undefined; order: Order; pct: number; manual: boolean; force: boolean; text?: string; resolve: () => void; reject: (error: unknown) => void };
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
    if (!job.text && (!job.order || !Array.isArray(job.order.items) || job.order.items.length === 0)) throw new Error('Pedido sem itens para imprimir.');
    if (!job.text && job.order.items.some(i => !i || typeof i.name !== 'string' || !Number.isFinite(Number(i.qty)))) throw new Error('Pedido com itens inválidos; não foi possível imprimir.');
    await connectPrinter();
    const printerName = await ensurePrinter(job.target);
    log('Printing:', job.order.number, printerName, printerPreferences.printMode);
    await withTimeout(sendText(await api(), printerName, job.text ?? formatReceipt(job.order, job.pct)));
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
export function printOrder(order: Order, serviceFeePct: number, options: { manual?: boolean; force?: boolean; target?: PrintTarget } = {}) {
 return new Promise<void>((resolve, reject) => {
  if (!options.manual && (queue.some(j => !j.manual && j.order.id === order.id) || (!options.force && wasAutomaticallyPrinted(order.id)))) { resolve(); return; }
  log('Queue order:', order.number);
  queue.push({ target: options.target, order, pct: serviceFeePct, manual: Boolean(options.manual), force: Boolean(options.force), resolve, reject });
  void drain();
 });
}
// Imprime o cupom de entrega com endereço. Manual e sem registro de automática:
// o entregador pode reimprimir quantas vezes precisar.
export function printDeliveryTicket(delivery: Delivery) {
 return new Promise<void>((resolve, reject) => {
  const order = { id: 'delivery-' + delivery.id, number: delivery.number, items: [] } as unknown as Order;
  queue.push({ target: undefined, order, pct: 0, manual: true, force: true, text: formatDeliveryTicket(delivery), resolve, reject });
  void drain();
 });
}
export async function testPrinter(target?: PrintTarget) {
 await connectPrinter();
 const printerName = await ensurePrinter(target);
 const qz = await api();
 const date = new Date();
 await withTimeout(sendText(qz, printerName, [center('TESTE DE ALINHAMENTO'), line, 'INICIO DA LINHA', 'PEDIDO COMPLETO', 'SUBTOTAL', 'TOTAL', '1234567890', 'R$ 123,45', 'ABCDEFGHIJKLMNOPQRSTUVWX', '-'.repeat(24), 'FIM DA LINHA', line, ...wrap('Impressora: ' + printerName), date.toLocaleString('pt-BR'), '', '', '', ''].join('\n')));
}
