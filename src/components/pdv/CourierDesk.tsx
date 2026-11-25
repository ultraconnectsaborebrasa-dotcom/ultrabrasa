import { useState } from 'react';
import { Clock3, CircleDollarSign, LogOut, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand } from './Brand';
import { DeliveryBoard } from './DeliveryBoard';
import { CourierClockPanel } from './CourierClockPanel';
import { CourierSettlementPanel } from './CourierSettlementPanel';
import { CourierLocationSharing } from './CourierLocationSharing';

export function CourierDesk({ name, signOut }: { name: string; signOut: () => Promise<void> }) {
  const [tab, setTab] = useState<'deliveries' | 'shift' | 'settlement'>('deliveries');
  return <div className="min-h-dvh bg-muted/20">
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-3 sm:px-5">
        <Brand />
        <div className="min-w-0 border-l pl-3">
          <h1 className="truncate text-sm font-bold">Ultraconnect Entregas</h1>
          <p className="truncate text-xs text-muted-foreground">{name} · Entregador</p>
        </div>
        <Button className="ml-auto" size="icon" variant="ghost" aria-label="Sair da conta" title="Sair da conta" onClick={() => void signOut()}><LogOut size={18} /></Button>
      </div>
    </header>
    <main className="mx-auto max-w-2xl space-y-4 p-3 pb-28 sm:p-5 sm:pb-28">
      <div hidden={tab !== 'shift'} className="space-y-4"><CourierClockPanel /><CourierLocationSharing /></div>
      <div hidden={tab !== 'deliveries'}><DeliveryBoard courier /></div>
      <div hidden={tab !== 'settlement'}><CourierSettlementPanel courier /></div>
    </main>
    <nav aria-label="Área do entregador" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-2xl grid-cols-3 gap-1 p-2">
        {([{ id: 'deliveries', label: 'Entregas', icon: Truck }, { id: 'shift', label: 'Ponto e GPS', icon: Clock3 }, { id: 'settlement', label: 'Meu acerto', icon: CircleDollarSign }] as const).map(item => <Button key={item.id} variant={tab === item.id ? 'default' : 'ghost'} aria-pressed={tab === item.id} className="h-16 flex-col gap-1 text-xs" onClick={() => setTab(item.id)}><item.icon size={21} />{item.label}</Button>)}
      </div>
    </nav>
  </div>;
}
