import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, LogIn, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/lib/confirm-action';
import { brl } from '@/lib/pdv-store';
import { COURIER_SHIFTS, saoPauloDay, type CourierOperations, type CourierShiftCode } from '@/lib/courier-operations';

const time = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Não registrada';

export function CourierClockPanel() {
  const day = saoPauloDay();
  const client = useQueryClient();
  const [busy, setBusy] = useState('');
  const query = useQuery({
    queryKey: ['courier-operations', day],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('read_courier_operations', { p_from: day, p_to: day });
      if (error) throw new Error(error.message);
      return data as unknown as CourierOperations;
    },
  });
  const entries = query.data?.time_entries ?? [];
  const openEntry = entries.find(entry => entry.exit_at === null);

  async function clock(action: 'entry' | 'exit', shift: CourierShiftCode) {
    if (action === 'exit' && !await confirmAction(`Registrar a saída do ${COURIER_SHIFTS[shift].label.toLowerCase()}? A localização deixará de ser compartilhada.`)) return;
    setBusy(`${action}:${shift}`);
    try {
      const { error } = await supabase.rpc('clock_courier_shift', { p_action: action, p_shift: shift });
      if (error) throw new Error(error.message);
      toast.success(action === 'entry' ? 'Entrada registrada. Agora você pode ativar a localização.' : 'Saída registrada e localização desativada.');
      await client.invalidateQueries({ queryKey: ['courier-operations'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar o ponto.');
    } finally {
      setBusy('');
    }
  }

  return <section aria-label="Ponto do entregador" className="mb-5 rounded-xl border bg-card p-4 shadow-sm">
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Clock3 className="text-primary" />
      <div><h2 className="text-lg font-bold">Meu ponto</h2><p className="text-sm text-muted-foreground">Registre entrada e saída · {brl(60)} por turno</p></div>
    </div>
    {query.error && <p role="alert" className="mb-3 text-sm text-destructive">{query.error.message}</p>}
    <div className="grid gap-3 md:grid-cols-2">
      {Object.values(COURIER_SHIFTS).map(shift => {
        const entry = entries.find(item => item.shift_code === shift.code && item.exit_at === null) ?? entries.find(item => item.shift_code === shift.code && item.exit_at !== null);
        const isOpen = entry?.exit_at === null;
        const isClosed = Boolean(entry?.exit_at);
        const disabled = Boolean(busy) || isClosed || Boolean(openEntry && !isOpen);
        return <article key={shift.code} className="rounded-lg border bg-background p-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{shift.label}</h3><p className="text-sm text-muted-foreground">{shift.start} às {shift.end}</p></div><b className="text-primary">{brl(shift.amount)}</b></div>
          <dl className="my-4 space-y-1 text-sm"><div className="flex justify-between gap-3"><dt>Entrada</dt><dd>{time(entry?.entry_at ?? null)}</dd></div><div className="flex justify-between gap-3"><dt>Saída</dt><dd>{time(entry?.exit_at ?? null)}</dd></div></dl>
          <Button className="w-full" variant={isOpen ? 'destructive' : 'default'} disabled={disabled || query.isPending} onClick={() => void clock(isOpen ? 'exit' : 'entry', shift.code)}>
            {isOpen ? <LogOut size={16} /> : <LogIn size={16} />}
            {busy === `${isOpen ? 'exit' : 'entry'}:${shift.code}` ? 'Salvando…' : isClosed ? 'Turno concluído' : isOpen ? 'Registrar saída' : 'Registrar entrada'}
          </Button>
        </article>;
      })}
    </div>
    {openEntry && <p role="status" className="mt-3 text-sm text-success">Turno aberto desde {time(openEntry.entry_at)}. A localização só pode ser compartilhada durante o turno.</p>}
  </section>;
}
