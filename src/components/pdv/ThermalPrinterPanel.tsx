import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, Printer, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isPrinterConnected, listPrinters, pendingPrintIds, printerPreferences, testPrinter, connectPrinter, disconnectPrinter } from '@/services/thermalPrinter';
import { isEpsonTmT20, preferredPhysicalPrinter, type PrinterModel } from '@/lib/printer-models';

export function ThermalPrinterPanel() {
  const [connected, setConnected] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [selected, setSelected] = useState(printerPreferences.selectedPrinter);
  const [autoPrint, setAutoPrint] = useState(printerPreferences.autoPrintEnabled);
  const [kitchen, setKitchen] = useState(printerPreferences.kitchenPrinter);
  const [cashier, setCashier] = useState(printerPreferences.cashierPrinter);
  const [mode, setMode] = useState(printerPreferences.printMode);
  const [model, setModel] = useState<PrinterModel>(printerPreferences.printerModel);
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
        toast.warning(`A impressora selecionada "${selected}" não está disponível agora. O PDV não usará outra impressora no lugar dela.`);
      }
      const preferred = preferredPhysicalPrinter(names);
      if (!selected && preferred) {
        setSelected(preferred);
        printerPreferences.selectedPrinter = preferred;
        if (isEpsonTmT20(preferred)) {
          setModel('epson-tm-t20');
          printerPreferences.printerModel = 'epson-tm-t20';
        }
      }
      toast.success(names.length ? `${names.length} impressora(s) encontrada(s). Selecione a Epson física abaixo.` : 'Nenhuma impressora encontrada no Windows.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao listar impressoras.');
    } finally { setBusy(''); }
  }
  async function selectEpson() {
    setBusy('epson');
    try {
      const names = await listPrinters();
      setPrinters(names);
      const epson = names.find(isEpsonTmT20);
      if (!epson) {
        toast.warning('A Epson TM-T20 não apareceu no QZ Tray. Ligue a Epson e confira se o QZ Tray está aberto; a impressora selecionada não foi alterada.');
        return;
      }
      setModel('epson-tm-t20');
      printerPreferences.printerModel = 'epson-tm-t20';
      setSelected(epson);
      printerPreferences.selectedPrinter = epson;
      toast.success(`Epson selecionada: ${epson}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível localizar a Epson TM-T20.');
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
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <b>A Epson é a impressora. O QZ Tray é somente a conexão.</b>
      <p className="mt-1 text-muted-foreground">Deixe o QZ Tray aberto no Windows e escolha <b>EPSON TM-T20</b> na lista de impressoras físicas. Não selecione PDF nem outra impressora virtual.</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${connected ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
        {connected ? <CheckCircle2 size={14}/> : <WifiOff size={14}/>}
        {connected ? 'QZ Tray conectado' : 'QZ Tray desconectado'}
      </span>
      {pending.length > 0 && <span className="text-xs text-warning">{pending.length} pedido(s) aguardando impressão</span>}
    </div>
    <div className="flex flex-wrap gap-2">
      <Button onClick={connect} disabled={!!busy}>{busy === 'connect' ? <LoaderCircle className="animate-spin"/> : <Wifi/>} 1. Conectar QZ Tray</Button>
      <Button variant="outline" onClick={refreshPrinters} disabled={!!busy}>{busy === 'list' ? <LoaderCircle className="animate-spin"/> : <RefreshCw/>} 2. Buscar impressoras</Button>
      {connected && <Button variant="outline" onClick={disconnect} disabled={!!busy}>Desconectar</Button>}
    </div>
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <label htmlFor="thermal-printer-model" className="text-sm font-medium">Modelo e largura do papel</label>
      <select id="thermal-printer-model" value={model} onChange={e => { const value = e.target.value as PrinterModel; setModel(value); printerPreferences.printerModel = value; }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
        <option value="auto">Detectar automaticamente</option>
        <option value="epson-tm-t20">Epson TM-T20 USB — 80 mm</option>
        <option value="thermal-58">Impressora térmica — 58 mm</option>
        <option value="thermal-80">Impressora térmica — 80 mm</option>
      </select>
      <Button variant="secondary" className="w-full" onClick={() => void selectEpson()} disabled={!!busy}>
        {busy === 'epson' ? <LoaderCircle className="animate-spin"/> : <Printer/>} Localizar e selecionar Epson TM-T20
      </Button>
      <p className="text-xs text-muted-foreground">Para a Epson USB, instale o driver Epson no Windows, conecte o cabo e ligue a impressora antes de buscar.</p>
    </div>
    <div className="space-y-2">
      <label htmlFor="thermal-printer-select" className="text-sm font-medium">3. Impressora física usada nos cupons</label>
      <select id="thermal-printer-select" value={selected} onChange={e => {
        const name = e.target.value;
        setSelected(name);
        printerPreferences.selectedPrinter = name;
        if (isEpsonTmT20(name)) {
          setModel('epson-tm-t20');
          printerPreferences.printerModel = 'epson-tm-t20';
        }
      }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
        <option value="">Selecione a Epson ou outra impressora física</option>
        {[...new Set([...printers, ...(selected ? [selected] : [])])].map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      {selected && <p className={`flex items-center gap-2 text-xs font-medium ${printers.includes(selected) ? 'text-success' : 'text-warning'}`}>
        {printers.includes(selected) ? <CheckCircle2 size={14}/> : <CircleAlert size={14}/>}
        {printers.includes(selected) ? `Selecionada para imprimir: ${selected}` : `Selecionada, mas não encontrada agora: ${selected}`}
      </p>}
      <p className="text-xs text-muted-foreground">A escolha fica salva neste computador. Se a Epson estiver desligada, o PDV avisa e não imprime em outra impressora.</p>
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
    <Button onClick={test} disabled={!!busy || !selected}>{busy === 'test' ? <LoaderCircle className="animate-spin"/> : <Printer/>} 4. Imprimir teste na impressora selecionada</Button>
    <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
      <CircleAlert size={16} className="mt-0.5 shrink-0"/>
      <p>O QZ Tray precisa estar aberto no mesmo computador que executa o UltraBrasa. O aplicativo já assina as impressões com o certificado "Ultrabrasa PDV": na primeira conexão, se o QZ Tray pedir autorização, marque "Lembrar esta decisão" e clique em Permitir uma única vez. Depois disso a impressão é totalmente automática, sem janelas.</p>
    </div>
  </div>;
}
