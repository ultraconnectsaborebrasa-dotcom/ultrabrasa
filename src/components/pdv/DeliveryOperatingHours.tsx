import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import type { DeliveryBase } from '@/lib/courier-operations';

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function DeliveryOperatingHours({ base, admin }: { base: DeliveryBase; admin: boolean }) {
  const client = useQueryClient();
  const [start, setStart] = useState((base.operating_start ?? '10:00').slice(0, 5));
  const [end, setEnd] = useState((base.operating_end ?? '14:00').slice(0, 5));
  const [days, setDays] = useState<number[]>(base.operating_days ?? [1, 2, 3, 4, 5, 6]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setStart((base.operating_start ?? '10:00').slice(0, 5));
    setEnd((base.operating_end ?? '14:00').slice(0, 5));
    setDays(base.operating_days ?? [1, 2, 3, 4, 5, 6]);
  }, [base.operating_start, base.operating_end, base.operating_days]);

  async function save() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('save_delivery_operating_hours', { p_start: `${start}:00`, p_end: `${end}:00`, p_days: days });
      if (error) throw new Error(error.message);
      toast.success('Horário da operação de entregas salvo.');
      await client.invalidateQueries({ queryKey: ['courier-operations'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar os horários.');
    } finally { setBusy(false); }
  }

  return <details className="rounded-xl border bg-background p-4"><summary className="cursor-pointer text-sm font-semibold">Horário da operação de entregas</summary><div className="mt-4 space-y-4 border-t pt-4">
    <div className="flex items-start gap-3"><CalendarClock size={20} className="text-primary" /><p className="text-sm text-muted-foreground">Horário inicial: 10h às 14h. Esta configuração orienta a operação e não altera os turnos de ponto nem bloqueia pedidos já integrados.</p></div>
    {admin ? <>
      <div className="flex flex-wrap gap-3"><label className="text-sm">Início<input aria-label="Início da operação" type="time" className="field ml-2 w-auto" value={start} onChange={event => setStart(event.target.value)} /></label><label className="text-sm">Fim<input aria-label="Fim da operação" type="time" className="field ml-2 w-auto" value={end} onChange={event => setEnd(event.target.value)} /></label></div>
      <fieldset><legend className="text-sm font-medium">Dias de funcionamento</legend><div className="mt-2 flex flex-wrap gap-2">{weekDays.map((label, day) => <label key={label} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${days.includes(day) ? 'border-primary bg-primary/10 text-primary' : ''}`}><input type="checkbox" className="sr-only" checked={days.includes(day)} onChange={event => setDays(current => event.target.checked ? [...current, day].sort() : current.filter(item => item !== day))} />{label}</label>)}</div></fieldset>
      <Button disabled={busy || !days.length || !start || !end} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar horário da operação'}</Button>
    </> : <p className="text-sm">{start}–{end} · {days.map(day => weekDays[day]).join(', ')}</p>}
  </div></details>;
}
