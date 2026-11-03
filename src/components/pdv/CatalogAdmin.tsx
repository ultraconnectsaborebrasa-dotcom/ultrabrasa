import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore, brl, setState } from "@/lib/pdv-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Row = { product_id: string; description: string; image_url: string | null; illustrative: boolean; published: boolean; featured: boolean; sort: number };

export function CatalogAdmin() {
  const products = useStore((s) => s.products);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string,string>>({});

  useEffect(() => {
    supabase.from("catalog_products").select("*").then(({ data, error }) => {
      if (error) { toast.error("Não foi possível carregar o cardápio"); return; }
      setRows(Object.fromEntries((data ?? []).map((r) => [r.product_id, r as Row])));
    });
  }, []);

  const list = useMemo(() => products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())), [products, q]);
  const get = (id: string): Row => rows[id] ?? { product_id: id, description: "", image_url: null, illustrative: false, published: true, featured: false, sort: 0 };
  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...get(id), ...patch } }));

  async function save(id: string, override?: Partial<Row>) {
    const name=(names[id]??products.find(p=>p.id===id)?.name??'').trim();
    if(!override&&!name){toast.error('Informe o nome do produto');return;}
    const r = { ...get(id), ...override }; setSaving(id);
    const { error } = await supabase.rpc("save_catalog_product", { _product_id: id, _description: r.description, _image_url: (r.image_url?.trim() || null) as string, _illustrative: false, _published: r.published, _featured: r.featured, _sort: r.sort });
    setSaving(null);
    if(!error&&!override&&names[id]!==undefined){
      setState(s=>({...s,products:s.products.map(p=>p.id===id?{...p,name}:p)}));
      setNames(previous=>{const next={...previous};delete next[id];return next;});
    }
    error ? toast.error(error.message) : toast.success("Cardápio atualizado");
  }

  async function upload(id: string, file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error("Use foto JPG, PNG ou WEBP"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A foto precisa ter até 5 MB"); return; }
    setSaving(id);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const name = `${id.replace(/[^A-Za-z0-9-]/g, "")}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("catalog-photos").upload(name, file, { contentType: file.type });
    if (error) { setSaving(null); toast.error("Não foi possível enviar a foto"); return; }
    const url = `/api/public/catalog-photo/${name}`;
    set(id, { image_url: url });
    await save(id, { image_url: url });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Cardápio digital</h2>
          <p className="text-sm text-muted-foreground">Edite foto, descrição e o que aparece em /cardapio. Preço e estoque vêm dos Produtos.</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Buscar produto" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
          <Button variant="outline" asChild><a href="/cardapio" target="_blank" rel="noreferrer">Ver cardápio</a></Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((p) => { const r = get(p.id); return (
          <div key={p.id} className="flex gap-3 rounded-lg border bg-card p-3">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
              {r.image_url ? <img src={r.image_url} alt={p.name} className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center text-xs text-muted-foreground">Sem foto</div>}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2"><b className="truncate">{p.name}</b><span className="text-sm text-muted-foreground">{brl(p.price)}</span></div>
              <label className="block space-y-1 text-sm"><span>Nome do produto</span><Input aria-label={`Nome do produto ${p.name}`} maxLength={120} value={names[p.id]??p.name} onChange={e=>setNames(n=>({...n,[p.id]:e.target.value}))}/></label>
              <Textarea rows={2} maxLength={400} placeholder="Descrição" value={r.description} onChange={(e) => set(p.id, { description: e.target.value })} />
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" asChild disabled={saving === p.id}>
                  <label className="cursor-pointer">{saving === p.id ? "Enviando..." : "Enviar foto do computador"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(p.id, f); }} />
                  </label>
                </Button>
              </div>
              <Input placeholder="ou cole o link da foto (https://...)" value={r.image_url ?? ""} onChange={(e) => set(p.id, { image_url: e.target.value })} />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-1"><input type="checkbox" checked={r.published} onChange={(e) => set(p.id, { published: e.target.checked })} />Mostrar</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={r.featured} onChange={(e) => set(p.id, { featured: e.target.checked })} />Destaque</label>
                <label className="flex items-center gap-1">Ordem<Input type="number" className="h-8 w-16" value={r.sort} onChange={(e) => set(p.id, { sort: Number(e.target.value) || 0 })} /></label>
                <Button size="sm" className="ml-auto" disabled={saving === p.id} onClick={() => save(p.id)}>{saving === p.id ? "Salvando..." : "Salvar"}</Button>
              </div>
            </div>
          </div>); })}
      </div>
    </div>
  );
}
