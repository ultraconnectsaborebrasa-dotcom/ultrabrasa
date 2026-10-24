import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, ChefHat, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { loadOrderAlerts, newKitchenOrders, playOrderSound, toggleOrderAlerts, unlockOrderSound, useOrderAlerts, type AlertOrder } from '@/lib/order-alerts';

export function NewOrderAlerts({ orders, ready = true, onOpen }: { orders: AlertOrder[]; ready?: boolean; onOpen: () => void }) {
  const enabled = useOrderAlerts();
  const previous = useRef<AlertOrder[] | null>(null);
  const [incoming, setIncoming] = useState<AlertOrder[]>([]);
  const [soundReady, setSoundReady] = useState(false);
  useEffect(() => {
    loadOrderAlerts();
    const unlock = () => { void unlockOrderSound().then(setSoundReady); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const added = previous.current ? newKitchenOrders(previous.current, orders) : [];
    previous.current = orders;
    if (!enabled) { setIncoming([]); return; }
    if (added.length) {
      setIncoming(pending => [...pending.filter(o => orders.some(p => p.id === o.id && p.status === 'cozinha')), ...added]);
      playOrderSound();
      toast.info(added.length === 1 ? `Novo pedido #${added[0]?.number} na cozinha` : `${added.length} novos pedidos na cozinha`, { duration: 8000 });
    } else {
      setIncoming(pending => pending.filter(o => orders.some(p => p.id === o.id && p.status === 'cozinha')));
    }
  }, [orders, ready, enabled]);
  return <div className="shrink-0 border-b bg-card px-3 py-2 sm:px-5">
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-auto text-xs text-muted-foreground">{enabled ? (soundReady ? 'Avisos com som' : 'Som aguardando ativação') : 'Avisos silenciados'}</span>
      <Button variant="ghost" size="icon" aria-label={enabled ? 'Silenciar avisos de pedidos' : 'Ativar avisos de pedidos'} title={enabled ? 'Silenciar avisos de pedidos' : 'Ativar avisos de pedidos'} aria-pressed={enabled} onClick={toggleOrderAlerts}>{enabled ? <Bell/> : <BellOff/>}</Button>
      <Button variant="ghost" size="icon" aria-label="Testar som de pedido" title="Testar som de pedido" onClick={async () => { const unlocked = await unlockOrderSound(); setSoundReady(unlocked); if (!unlocked || !playOrderSound()) toast.warning('Não foi possível ativar o som. Confira o áudio deste dispositivo.'); }}>{soundReady ? <Volume2/> : <VolumeX/>}</Button>
    </div>
    {incoming.length > 0 && <div key={incoming.map(o => o.id).join(',')} role="status" aria-live="polite" className="order-arrival mt-2 flex flex-wrap items-center gap-3 border-l-4 border-primary bg-primary/10 p-3">
      <Bell className="order-arrival-bell shrink-0 text-primary"/>
      <div className="min-w-0 flex-1"><p className="font-bold text-primary">{incoming.length === 1 ? `Novo pedido #${incoming[0]?.number}` : `${incoming.length} novos pedidos`}</p><p className="break-words text-sm">{incoming.map(o => `#${o.number} · ${o.tableNumber ? `Mesa ${o.tableNumber}` : o.type ?? 'Cozinha'}`).join(' / ')}</p></div>
      <Button onClick={() => { onOpen(); setIncoming([]); }}><ChefHat/>Ver na cozinha</Button>
    </div>}
  </div>;
}