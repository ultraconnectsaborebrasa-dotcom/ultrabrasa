import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/lib/confirm-action";
import { brl } from "@/lib/pdv-store";
import { clockOutSummary, type CourierSettlementRow } from "@/lib/courier-settlement";
import {
  COURIER_SHIFTS,
  currentCourierShift,
  saoPauloDay,
  type CourierOperations,
  type CourierShiftCode,
} from "@/lib/courier-operations";

const time = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

export function CourierClockPanel() {
  const client = useQueryClient();
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const day = saoPauloDay(now ?? new Date());
  const query = useQuery({
    queryKey: ["courier-operations", day],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("read_courier_operations", {
        p_from: day,
        p_to: day,
      });
      if (error) throw new Error(error.message);
      return data as unknown as CourierOperations;
    },
  });

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const entries = query.data?.time_entries ?? [];
  const openEntry = entries.find((entry) => entry.exit_at === null);
  const shiftCode = openEntry?.shift_code ?? (now ? currentCourierShift(now) : "morning");
  const shift = COURIER_SHIFTS[shiftCode];
  const entry = openEntry ?? entries.find((item) => item.shift_code === shiftCode);
  const isOpen = entry?.exit_at === null;
  const isClosed = Boolean(entry?.exit_at);

  async function clock(action: "entry" | "exit", shiftCode: CourierShiftCode) {
    let summary = "";
    if (action === "exit") {
      const { data } = await supabase.rpc("read_courier_settlement", { p_day: saoPauloDay() });
      summary = `Seus repasses de hoje:\n${clockOutSummary((data as unknown as CourierSettlementRow[]) ?? [])}\n\n`;
    }
    if (
      action === "exit" &&
      !(await confirmAction(
        `${summary}Registrar a saída do ${COURIER_SHIFTS[shiftCode].label.toLowerCase()}? A localização deixará de ser compartilhada.`,
      ))
    )
      return;
    setBusy(`${action}:${shiftCode}`);
    try {
      const { error } = await supabase.rpc("clock_courier_shift", {
        p_action: action,
        p_shift: shiftCode,
      });
      if (error) throw new Error(error.message);
      toast.success(
        action === "entry"
          ? "Entrada registrada. Agora você pode ativar a localização."
          : "Saída registrada e localização desativada.",
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["courier-operations"] }),
        client.invalidateQueries({ queryKey: ["courier-location-sharing"] }),
        client.invalidateQueries({ queryKey: ["delivery-board"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar o ponto.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section aria-label="Ponto do entregador" className="mb-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Clock3 size={18} /></div>
        <div className="min-w-0 flex-1"><h2 className="font-bold">Meu ponto</h2><p className="text-[11px] text-muted-foreground">Registros de hoje</p></div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">{brl(60)} <span className="font-normal text-muted-foreground">por turno</span></span>
      </div>

      <div className={entry ? "p-3" : "p-4"}>
        {query.error && <p role="alert" className="mb-3 text-sm text-destructive">{query.error.message}</p>}
        {!now || query.isPending ? (
          <div className="rounded-xl border bg-background p-4" role="status"><p className="text-sm text-muted-foreground">Carregando seu ponto…</p></div>
        ) : entry ? (
          <article className="rounded-xl border bg-background p-3.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Ponto de hoje</p><h3 className="mt-0.5 font-bold">{shift.label}</h3></div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isClosed ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
                {isClosed && <CheckCircle2 size={13} />}{isClosed ? "Concluído" : "Em andamento"}
              </span>
            </div>
            <dl className={`mt-3 grid gap-2 ${isClosed ? "grid-cols-2" : ""}`}>
              <div className="rounded-lg bg-muted/60 px-3 py-2"><dt className="text-[10px] text-muted-foreground">Entrada registrada</dt><dd className="mt-0.5 text-lg font-bold">{time(entry.entry_at)}</dd></div>
              {isClosed && <div className="rounded-lg bg-success/10 px-3 py-2"><dt className="text-[10px] text-muted-foreground">Saída registrada</dt><dd className="mt-0.5 text-lg font-bold text-success">{time(entry.exit_at ?? "")}</dd></div>}
            </dl>
            {isOpen && <div className="mt-3"><Button className="w-full" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void clock("exit", shiftCode)}><LogOut size={15} />{busy === `exit:${shiftCode}` ? "Salvando…" : "Registrar saída"}</Button><p className="mt-2 text-center text-[10px] text-muted-foreground">Ao sair, a localização será desativada.</p></div>}
            {isClosed && <p role="status" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-success"><CheckCircle2 size={14} />Turno concluído e horários salvos.</p>}
          </article>
        ) : (
          <article className="rounded-xl border bg-background p-4">
            <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ponto de hoje</p><h3 className="mt-1 text-xl font-bold">{shift.label}</h3></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">Não iniciado</span></div>
            <div className="mt-4 rounded-xl border border-dashed p-4 text-center"><p className="text-sm text-muted-foreground">Registre seu horário para começar este turno.</p><Button className="mt-4 w-full sm:w-auto" size="lg" disabled={Boolean(busy)} onClick={() => void clock("entry", shiftCode)}><LogIn size={17} />{busy === `entry:${shiftCode}` ? "Salvando…" : "Bater ponto"}</Button></div>
          </article>
        )}
      </div>
    </section>
  );
}
