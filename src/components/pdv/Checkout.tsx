import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl, type Payment, uid } from "@/lib/pdv-store";
import { Trash2 } from "lucide-react";

export function Checkout({ open, onClose, total, methods, onConfirm, title }: {
  open: boolean; onClose: () => void; total: number; methods: string[]; title: string;
  onConfirm: (p: Payment[]) => void;
}) {
  const [pays, setPays] = useState<(Payment & { id: string })[]>([]);
  const [method, setMethod] = useState<string>(methods[0] ?? "Pix");
  const [amount, setAmount] = useState("");
  const paidSum = pays.reduce((a, p) => a + p.amount, 0);
  const remaining = Math.max(0, Math.round((total - paidSum) * 100) / 100);
  const change = Math.max(0, paidSum - total);
  const hasCash = pays.some((p) => p.method === "Dinheiro");

  useEffect(() => { if (open) { setPays([]); setMethod(methods[0] ?? "Pix"); setAmount(""); } }, [open, methods]);
  useEffect(() => { setAmount(remaining ? remaining.toFixed(2) : ""); }, [remaining]);

  const quick = useMemo(() => {
    const r = remaining; if (!r) return [];
    const set = new Set([r, Math.ceil(r / 5) * 5, Math.ceil(r / 10) * 10, Math.ceil(r / 50) * 50, 100]);
    return [...set].filter((v) => v >= r).sort((a, b) => a - b).slice(0, 4);
  }, [remaining]);

  const add = (v?: number) => {
    const n = v ?? parseFloat(amount.replace(",", "."));
    if (!n || n <= 0) return;
    if (method !== "Dinheiro" && n > remaining + 0.001) return; // troco só em dinheiro
    setPays((p) => [...p, { id: uid(), method, amount: Math.round(n * 100) / 100 }]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg border-border bg-card">
        <DialogHeader><DialogTitle className="font-display text-2xl">{title}</DialogTitle></DialogHeader>
        <div className="rounded-xl bg-elevated p-4 text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Total a cobrar</div>
          <div className="font-display text-4xl font-bold text-ember-gradient">{brl(total)}</div>
          <div className="mt-2 flex justify-center gap-6 text-sm">
            <span>Falta <b className={remaining ? "text-warning" : "text-success"}>{brl(remaining)}</b></span>
            {change > 0 && <span>Troco <b className="text-success">{brl(change)}</b></span>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {methods.map((m) => (
            <button key={m} onClick={() => setMethod(m)}
              className={`btn ${method === m ? "btn-primary" : "btn-ghost"}`}>{m}</button>
          ))}
        </div>

        {remaining > 0 && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input className="field font-mono text-lg" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} autoFocus />
              <button className="btn btn-ghost" onClick={() => add()}>Adicionar</button>
            </div>
            {method === "Dinheiro" && (
              <div className="flex flex-wrap gap-2">
                {quick.map((v) => <button key={v} className="btn btn-ghost text-xs" onClick={() => add(v)}>{brl(v)}</button>)}
              </div>
            )}
            {method !== "Dinheiro" && <p className="text-xs text-muted-foreground">Dica: divida a conta adicionando várias formas de pagamento.</p>}
          </div>
        )}

        {pays.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border">
            {pays.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{p.method}</span>
                <span className="flex items-center gap-3 font-mono">{brl(p.amount)}
                  <button onClick={() => setPays((x) => x.filter((y) => y.id !== p.id))} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <button className="btn btn-primary w-full py-3 text-base" disabled={remaining > 0}
          onClick={() => {
            const out: Payment[] = pays.map(({ method, amount }) => ({ method, amount }));
            if (change > 0 && hasCash) {
              const i = out.findIndex((p) => p.method === "Dinheiro");
              const c = out[i]; if (c) out[i] = { method: c.method, amount: Math.round((c.amount - change) * 100) / 100 };
            }
            onConfirm(out);
          }}>
          {remaining > 0 ? `Falta ${brl(remaining)}` : "Confirmar pagamento"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
