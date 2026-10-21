import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl, setState, uid, useStore, type Product } from "@/lib/pdv-store";

export function EditProduct({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const cats = useStore((s) => s.settings.categories);
  const all = useStore((s) => s.products);
  const [f, setF] = useState<Product | null>(product);
  useEffect(() => setF(product), [product]);
  if (!f) return null;
  const set = (patch: Partial<Product>) => setF({ ...f, ...patch });
  const num = (v: string) => parseFloat(v.replace(",", ".")) || 0;
  const margin = f.price ? ((f.price - f.cost) / f.price) * 100 : 0;

  const save = () => {
    if (!f.name.trim()) return toast.error("Informe o nome.");
    setState((s) => ({
      ...s,
      products: f.id ? s.products.map((p) => (p.id === f.id ? f : p)) : [...s.products, { ...f, id: uid() }],
    }));
    toast.success("Produto salvo");
    onClose();
  };
  const remove = () => {
    if (!confirm(`Excluir "${f.name}"?`)) return;
    setState((s) => ({ ...s, products: s.products.filter((p) => p.id !== f.id) }));
    onClose();
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg border-border bg-card">
        <DialogHeader><DialogTitle className="font-display text-2xl">{f.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <L t="Nome" span><input className="field" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></L>
          <L t="Categoria"><select className="field" value={f.category} onChange={(e) => set({ category: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select></L>
          <L t="Preço de venda (R$)"><input className="field font-mono" inputMode="decimal" defaultValue={f.price || ""} onChange={(e) => set({ price: num(e.target.value) })} /></L>
          <L t="Custo (R$)"><input className="field font-mono" inputMode="decimal" defaultValue={f.cost || ""} onChange={(e) => set({ cost: num(e.target.value) })} /></L>
          <L t="Margem"><div className={`field font-mono ${margin < 30 ? "text-warning" : "text-success"}`}>{margin.toFixed(0)}% · lucro {brl(f.price - f.cost)}</div></L>
          <L t="Controlar estoque?">
            <select className="field" value={f.stock === null ? "nao" : "sim"} onChange={(e) => set({ stock: e.target.value === "sim" ? 0 : null })}>
              <option value="nao">Não</option><option value="sim">Sim</option>
            </select>
          </L>
          {f.stock !== null && <>
            <L t="Estoque atual"><input className="field font-mono" type="number" value={f.stock} onChange={(e) => set({ stock: Math.max(0, parseInt(e.target.value) || 0) })} /></L>
            <L t="Alerta abaixo de"><input className="field font-mono" type="number" value={f.minStock} onChange={(e) => set({ minStock: parseInt(e.target.value) || 0 })} /></L>
          </>}
          <L t="Sugerir junto (venda sugestiva)" span>
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto rounded-md border p-2">
              {all.filter((p) => p.id !== f.id).map((p) => {
                const on = f.upsell?.includes(p.id);
                return <button key={p.id} onClick={() => set({ upsell: on ? f.upsell!.filter((x) => x !== p.id) : [...(f.upsell ?? []), p.id] })}
                  className={`rounded-full px-2 py-0.5 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{p.name}</button>;
              })}
            </div>
          </L>
          <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Disponível para venda</label>
        </div>
        <div className="flex gap-2">
          {f.id && <button className="btn btn-ghost text-destructive" onClick={remove}>Excluir</button>}
          <button className="btn btn-primary ml-auto" onClick={save}>Salvar</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
const L = ({ t, children, span }: { t: string; children: React.ReactNode; span?: boolean }) => (
  <label className={`space-y-1 ${span ? "col-span-2" : ""}`}><span className="text-xs text-muted-foreground">{t}</span>{children}</label>
);
