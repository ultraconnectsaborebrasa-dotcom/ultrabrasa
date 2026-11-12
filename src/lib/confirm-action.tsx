import { createRoot } from 'react-dom/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// In-app confirmation: window.confirm is blocked inside the desktop app.
export function confirmAction(message: string, confirmLabel = 'Confirmar'): Promise<boolean> {
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: boolean) => { resolve(v); root.unmount(); host.remove(); };
    root.render(
      <Dialog open onOpenChange={o => { if (!o) done(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirmar ação</DialogTitle></DialogHeader>
          <p className="text-sm">{message}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => done(false)}>Voltar</Button>
            <Button onClick={() => done(true)}>{confirmLabel}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  });
}
