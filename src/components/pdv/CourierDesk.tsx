import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand } from './Brand';
import { DeliveryBoard } from './DeliveryBoard';
import { CourierClockPanel } from './CourierClockPanel';
import { CourierSettlementPanel } from './CourierSettlementPanel';
import { CourierLocationSharing } from './CourierLocationSharing';

export function CourierDesk({ name, signOut }: { name: string; signOut: () => Promise<void> }) {
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
    <main className="mx-auto max-w-2xl space-y-4 p-3 pb-10 sm:p-5">
      <CourierClockPanel />
      <CourierLocationSharing />
      <DeliveryBoard courier />
      <CourierSettlementPanel courier />
    </main>
  </div>;
}
