import { useState, type ReactNode } from 'react';
import { Building2, ShoppingCart, ChefHat, Palette, Tags, Link2, Save, Plus, X, Download, ShieldCheck, RotateCcw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getState, resetAll, setState, useSaving, useStore, type Settings } from '@/lib/pdv-store';
import { validateSettings } from '@/lib/pdv-settings';
import { useSyncStatus } from '@/lib/pdv-cloud';
import { Brand } from './Brand';
import { ThermalPrinterPanel } from './ThermalPrinterPanel';

const groups = [
  { id: 'store', label: 'Loja', icon: Building2 }, { id: 'sales', label: 'Vendas e taxas', icon: ShoppingCart },
  { id: 'catalog', label: 'Cardápio e pagamentos', icon: Tags }, { id: 'kitchen', label: 'Cozinha', icon: ChefHat },
  { id: 'appearance', label: 'Aparência', icon: Palette }, { id: 'connections', label: 'Conexões e acesso', icon: Link2 },
] as const;

export function SettingsView({ goAdmin }: { goAdmin: () => void }) {
  const saved = useStore(s => s.settings);
  const saving = useSaving();
  const sync = useSyncStatus();
  const [draft, setDraft] = useState<Settings>(() => structuredClone(saved));
  const [group, setGroup] = useState<string>('store');
  const [error, setError] = useState('');
  const [reset, setReset] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<Settings>) => { setDraft(s => ({ ...s, ...patch })); setError(''); };
  function save() {
    const issue = validateSettings(draft);
    if (issue) { setError(issue); return; }
    setState(s => ({ ...s, settings: { ...draft, storeName: draft.storeName.trim() } }));
  }
  function backup() {
    const { draft: localDraft, ...shared } = getState();
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: shared }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `ultraconnect-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-primary"><ShieldCheck size={14}/> Administração</div><h1 className="text-3xl font-bold">Configurações</h1><p className="mt-1 text-sm text-muted-foreground">{saved.storeName} · Sabor e Brasa</p></div>
      <div className="flex flex-wrap items-center gap-2"><span role="status" className="mr-2 text-xs text-muted-foreground">{saving ? 'Salvando…' : dirty ? 'Alterações não salvas' : <span className="flex items-center gap-1 text-success"><Check size={14}/> Tudo salvo</span>}</span><Button variant="outline" disabled={!dirty || saving} onClick={() => { setDraft(structuredClone(saved)); setError(''); }}>Descartar</Button><Button disabled={!dirty || saving} onClick={save}><Save/> Salvar alterações</Button></div>
    </div>
    {error && <p role="alert" className="border-l-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Configurações" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">{groups.map(g => <Button key={g.id} variant="ghost" aria-pressed={group === g.id} onClick={() => setGroup(g.id)} className={`shrink-0 justify-start md:w-full ${group === g.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}><g.icon/>{g.label}</Button>)}</nav>
      <div className="min-w-0 space-y-8">
        {group === 'store' && <><Section title="Identidade da loja"><div className="flex items-center gap-5"><Brand/><div className="min-w-0 flex-1"><Field label="Nome da loja"><input className="field" value={draft.storeName} maxLength={70} onChange={e => set({ storeName: e.target.value })}/></Field><p className="mt-2 text-xs text-muted-foreground">Sabor e Brasa</p></div></div></Section><Section title="Meta de vendas"><NumberField label="Meta diária (R$)" value={draft.dailyGoal} onChange={v => set({ dailyGoal: v })}/></Section><Section title="Dados da loja"><Button variant="outline" onClick={backup}><Download/> Baixar cópia dos dados</Button><div className="mt-6 border-t pt-5"><Button variant="ghost" className="text-destructive" onClick={() => setReset(true)}><RotateCcw/> Restaurar dados de fábrica</Button></div></Section></>}
        {group === 'sales' && <><Section title="Taxas e descontos"><div className="grid gap-5 sm:grid-cols-2"><NumberField label="Taxa de serviço (%)" value={draft.serviceFeePct} max={100} onChange={v => set({ serviceFeePct: v })}/><NumberField label="Taxa de entrega (R$)" value={draft.deliveryFee} onChange={v => set({ deliveryFee: v })}/><NumberField label="Desconto máximo (%)" value={draft.maxDiscountPct} max={100} onChange={v => set({ maxDiscountPct: v })}/></div></Section><Section title="Preferências de venda"><Toggle label="Aplicar serviço ao selecionar Mesa" checked={draft.autoServiceOnTable !== false} onChange={v => set({ autoServiceOnTable: v })}/><Toggle label="Sugestões de acompanhamentos e bebidas" checked={draft.upsellEnabled !== false} onChange={v => set({ upsellEnabled: v })}/></Section></>}
        {group === 'catalog' && <><Section title="Categorias"><List items={draft.categories} onChange={categories => set({ categories })}/></Section><Section title="Formas de pagamento"><List items={draft.paymentMethods} onChange={paymentMethods => set({ paymentMethods })}/></Section></>}
        {group === 'kitchen' && <Section title="Tempo de preparo"><div className="grid gap-5 sm:grid-cols-2"><NumberField label="Primeiro alerta (minutos)" value={draft.kitchenWarningMinutes ?? 10} min={1} onChange={v => set({ kitchenWarningMinutes: v })}/><NumberField label="Pedido atrasado (minutos)" value={draft.kitchenLateMinutes ?? 20} min={2} onChange={v => set({ kitchenLateMinutes: v })}/></div><div className="mt-5 flex flex-wrap gap-5 text-sm"><span className="text-warning">● Primeiro alerta</span><span className="text-destructive">● Atrasado</span><span className="text-success">● Pronto</span></div></Section>}
        {group === 'appearance' && <><Section title="Identidade Ultraconnect"><div className="flex items-center gap-5"><Brand/><div><h3 className="font-semibold">Sabor e Brasa</h3><div className="mt-3 flex gap-2"><span className="h-6 w-6 rounded-full border bg-background"/><span className="h-6 w-6 rounded-full bg-ember"/><span className="h-6 w-6 rounded-full bg-primary"/><span className="h-6 w-6 rounded-full bg-foreground"/></div></div></div></Section><Section title="Preferências da tela"><Toggle label="Animações de transição" checked={draft.animationsEnabled !== false} onChange={v => set({ animationsEnabled: v })}/><Toggle label="Cardápio compacto" checked={draft.compactCatalog === true} onChange={v => set({ compactCatalog: v })}/></Section></>}
        {group === 'connections' && <><Section title="Impressora térmica"><ThermalPrinterPanel /></Section><Section title="Dispositivos"><div className="flex items-center justify-between gap-3 text-sm"><span>Celular, computador e cozinha</span><span className={sync === 'live' ? 'text-success' : 'text-warning'}>{sync === 'live' ? 'Conectados' : sync === 'offline' ? 'Sem conexão' : 'Conectando…'}</span></div></Section><Section title="iFood"><span className="text-sm text-warning">Aguardando integração oficial</span><p className="mt-2 text-sm text-muted-foreground">É necessário aprovar a integração e autorizar sua loja para receber pedidos do iFood.</p><Button variant="outline" className="mt-4" asChild><a href="https://developer.ifood.com.br" target="_blank" rel="noopener noreferrer">Portal oficial iFood</a></Button></Section><Section title="Acesso da equipe"><Button variant="outline" onClick={goAdmin}><ShieldCheck/> Gerenciar atendentes e administradores</Button></Section></>}
      </div>
    </div>
    <Dialog open={reset} onOpenChange={setReset}><DialogContent><DialogHeader><DialogTitle>Restaurar dados de fábrica?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Vendas, produtos, caixa e configurações compartilhados serão substituídos. Baixe uma cópia antes de continuar.</p><Field label="Digite RESTAURAR para confirmar"><input className="field" value={confirmation} onChange={e => setConfirmation(e.target.value)}/></Field><Button variant="outline" onClick={backup}><Download/> Baixar cópia</Button><Button variant="destructive" disabled={confirmation !== 'RESTAURAR' || saving} onClick={() => { resetAll(); setReset(false); setDraft(structuredClone(getState().settings)); setConfirmation(''); }}>Restaurar dados</Button></DialogContent></Dialog>
  </section>;
}
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="border-b pb-7 last:border-0"><h2 className="mb-5 text-lg font-semibold">{title}</h2>{children}</section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-2"><span className="text-sm text-muted-foreground">{label}</span>{children}</label>; }
function NumberField({ label, value, onChange, min = 0, max }: { label: string; value: number; onChange: (v:number) => void; min?: number; max?: number }) { return <Field label={label}><input type="number" min={min} max={max} step="any" className="field font-mono" value={value} onChange={e => onChange(e.target.valueAsNumber || 0)}/></Field>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v:boolean) => void }) { return <label className="flex cursor-pointer items-center justify-between gap-4 border-b py-4 first:pt-0 last:border-0"><span className="text-sm">{label}</span><input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-primary"/></label>; }
function List({ items, onChange }: { items: string[]; onChange: (items:string[]) => void }) {
  const [value,setValue] = useState('');
  const add = () => { const next = value.trim(); if (next && !items.includes(next)) { onChange([...items,next]); setValue(''); } };
  return <div className="space-y-3"><div className="space-y-2">{items.map((item,index) => <div key={index} className="flex items-center gap-2"><input aria-label={`Nome ${index+1}`} className="field" value={item} onChange={e => onChange(items.map((s,i) => i === index ? e.target.value : s))}/><Button variant="ghost" size="icon" title={`Remover ${item}`} aria-label={`Remover ${item}`} disabled={items.length === 1} onClick={() => onChange(items.filter((_,i) => i !== index))}><X/></Button></div>)}</div><div className="flex gap-2"><input aria-label="Novo nome" className="field" placeholder="Novo nome" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if(e.key === 'Enter')add(); }}/><Button variant="outline" onClick={add} disabled={!value.trim() || items.includes(value.trim())}><Plus/> Adicionar</Button></div></div>;
}