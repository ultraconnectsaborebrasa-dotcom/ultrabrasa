import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, Printer, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isPrinterConnected, listPrinters, pendingPrintIds, printerPreferences, testPrinter, connectPrinter, disconnectPrinter } from '@/services/thermalPrinter';

export function ThermalPrinterPanel() {
  const [connected, setConnected] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [selected, setSelected] = useState(printerPreferences.selectedPrinter);
  const [autoPrint, setAutoPrint] = useState(printerPreferences.autoPrintEnabled);
  const [kitchen, setKitchen] = useState(printerPreferences.kitchenPrinter);
  const [cashier, setCashier] = useState(printerPreferences.cashierPrinter);
  const [mode, setMode] = useState(printerPreferences.printMode);
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState<string[]>(pendingPrintIds());

  useEffect(() => {
    const update = () => { setConnected(isPrinterConnected()); setPending(pendingPrintIds()); };
    update();
    const timer = window.setInterval(update, 2000);
    return () => window.clearInterval(timer);
  }, []);

  async function connect() {
    setBusy('connect');
    try {
      await connectPrinter();
      setConnected(true);
      toast.success('QZ Tray conectado neste computador.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível conectar ao QZ Tray.');
    } finally { setBusy(''); }
  }
  async function refreshPrinters() {
    setBusy('list');
    try {
      const names = await listPrinters();
      setPrinters(names);
      if (selected && !names.includes(selected)) {
        setSelected('');
        printerPreferences.selectedPrinter = '';
      }
      const onlyPrinter = names.length === 1 ? names[0] : undefined;
      if (!selected && onlyPrinter !== undefined) {
        setSelected(onlyPrinter);
        printerPreferences.selectedPrinter = onlyPrinter;
      }
      toast.success(names.length ? `${names.length} impressora(s) encontrada(s).` : 'Nenhuma impressora encontrada no Windows.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao listar impressoras.');
    } finally { setBusy(''); }
  }
  async function test() {
    setBusy('test');
    try { await testPrinter(); toast.success('Teste enviado à impressora.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Falha no teste de impressão.'); }
    finally { setBusy(''); }
  }
  async function disconnect() {
    setBusy('disconnect');
    try { await disconnectPrinter(); setConnected(false); toast.success('QZ Tray desconectado.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível desconectar.'); }
    finally { setBusy(''); }
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Conecte o QZ Tray neste computador para enviar comandas à impressora térmica Bluetooth instalada no Windows.</p>
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${connected ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
        {connected ? <CheckCircle2 size={14}/> : <WifiOff size={14}/>}
        {connected ? 'QZ Tray conectado' : 'QZ Tray desconectado'}
      </span>
      {pending.length > 0 && <span className="text-xs text-warning">{pending.length} pedido(s) aguardando impressão</span>}
    </div>
    <div className="flex flex-wrap gap-2">
      <Button onClick={connect} disabled={!!busy}>{busy === 'connect' ? <LoaderCircle className="animate-spin"/> : <Wifi/>} Conectar ao QZ Tray</Button>
      <Button variant="outline" onClick={refreshPrinters} disabled={!!busy}>{busy === 'list' ? <LoaderCircle className="animate-spin"/> : <RefreshCw/>} Listar impressoras</Button>
      {connected && <Button variant="outline" onClick={disconnect} disabled={!!busy}>Desconectar</Button>}
    </div>
    <div className="space-y-2">
      <label htmlFor="thermal-printer-select" className="text-sm font-medium">Impressora do Windows</label>
      <select id="thermal-printer-select" value={selected} onChange={e => { setSelected(e.target.value); printerPreferences.selectedPrinter = e.target.value; }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
        <option value="">Selecione uma impressora</option>
        {[...new Set([...printers, ...(selected ? [selected] : [])])].map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">Se a impressora não aparecer, confira se ela está ligada, pareada e instalada em Windows → Printers & scanners.</p>
    </div>
    {([['kitchen', 'Impressora da cozinha', kitchen, setKitchen], ['cashier', 'Impressora do caixa', cashier, setCashier]] as const).map(([key, label, value, setValue]) => <div key={key} className="space-y-2">
      <label htmlFor={`printer-${key}`} className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <select id={`printer-${key}`} value={value} onChange={e => { setValue(e.target.value); if (key === 'kitchen') printerPreferences.kitchenPrinter = e.target.value; else printerPreferences.cashierPrinter = e.target.value; }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Usar a impressora principal</option>
          {[...new Set([...printers, ...(value ? [value] : [])])].map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <Button variant="outline" disabled={!!busy} onClick={async () => { setBusy('test-' + key); try { await testPrinter(key); toast.success('Teste enviado.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha no teste de impressão.'); } finally { setBusy(''); } }}>{busy === 'test-' + key ? <LoaderCircle className="animate-spin"/> : <Printer/>} Testar</Button>
      </div>
    </div>)}
    <div className="space-y-2">
      <label htmlFor="thermal-print-mode" className="text-sm font-medium">Modo de impressão</label>
      <select id="thermal-print-mode" value={mode} onChange={e => { const v = e.target.value === 'raw' ? 'raw' : 'driver'; setMode(v); printerPreferences.printMode = v; }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
        <option value="driver">Pelo driver do Windows (recomendado)</option>
        <option value="raw">Comandos diretos ESC/POS</option>
      </select>
      <p className="text-xs text-muted-foreground">Se o teste não sair no papel, troque o modo e imprima o teste novamente.</p>
    </div>
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="space-y-1"><div className="text-sm font-medium">Impressão automática</div><p className="text-xs text-muted-foreground">Imprimir automaticamente cada pedido enviado à cozinha neste computador. O QZ Tray e a impressora precisam estar configurados.</p></div>
      <input aria-label="Impressão automática" type="checkbox" checked={autoPrint} onChange={e => { setAutoPrint(e.target.checked); printerPreferences.autoPrintEnabled = e.target.checked; }} className="mt-1 h-4 w-4 accent-primary"/>
    </div>
    <Button variant="outline" onClick={test} disabled={!!busy}>{busy === 'test' ? <LoaderCircle className="animate-spin"/> : <Printer/>} Imprimir teste</Button>
    <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
      <CircleAlert size={16} className="mt-0.5 shrink-0"/>
      <p>O QZ Tray precisa estar aberto no mesmo computador que executa o UltraBrasa. O aplicativo já assina as impressões com o certificado "Ultrabrasa PDV": na primeira conexão, se o QZ Tray pedir autorização, marque "Lembrar esta decisão" e clique em Permitir uma única vez. Depois disso a impressão é totalmente automática, sem janelas.</p>
    </div>
  </div>;
}
