import { useState } from 'react';
import { History, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tableLabel } from '@/lib/pdv-tables';
import type { OperatorHistoryOrder } from '@/lib/pdv-operator';
const statuses: Record<string, string> = { aberta: 'Aberto', cozinha: 'Em preparação', pronto: 'Pronto para servir', pago: 'Concluído', cancelado: 'Cancelado' };
export function OperatorHistory({ orders }: { orders: OperatorHistoryOrder[] }) {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'all' | 'active' | 'closed'>('all');
  const list = orders.filter(o => {
    const active = ['aberta','cozinha','pronto'].includes(o.status);
    return (mode === 'all' || (mode === 'active' ? active : !active)) && `${o.customer} ${o.customerPhone ?? ''} ${o.number}`.toLowerCase().includes(search.toLowerCase());
  });
  return <main className="pdv-view-enter space-y-5 p-4">
    <div className="flex items-center gap-2"><History className="text-primary"/><h2 className="text-2xl font-bold">Meus atendimentos</h2></div>
    <div className="flex flex-wrap gap-3"><div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-3 text-muted-foreground"/><input className="field pl-9" aria-label="Buscar atendimento" placeholder="Nome, WhatsApp ou pedido" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="flex flex-wrap gap-1">{([['all','Todos'],['active','Em atendimento'],['closed','Encerrados']] as const).map(([value,label])=><Button key={value} variant={mode===value?'default':'ghost'} onClick={()=>setMode(value)}>{label}</Button>)}</div></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map(o=><article className="rounded-lg border bg-card p-4" key={o.id}>
      <div className="flex items-start justify-between gap-3"><h3 className="flex min-w-0 items-center gap-2 font-semibold"><UserRound size={18} className="shrink-0 text-primary"/><span className="break-words">{o.customer || 'Cliente não identificado'}</span></h3><span className="shrink-0 font-mono text-muted-foreground">#{o.number}</span></div>
      {o.customerPhone&&<p className="mt-1 text-sm text-muted-foreground">+{o.customerPhone}</p>}
      <div className="my-3 flex flex-wrap justify-between gap-2 text-sm"><span>{tableLabel(o)}</span><span className={o.status==='cancelado'?'text-destructive':o.status==='pago'?'text-success':'text-warning'}>{statuses[o.status] ?? o.status}</span></div>
      <p className="text-xs text-muted-foreground">Aberto em {new Date(o.createdAt).toLocaleString('pt-BR')}</p>{o.paidAt&&<p className="mt-1 text-xs text-muted-foreground">Concluído em {new Date(o.paidAt).toLocaleString('pt-BR')}</p>}
      <ul className="mt-3 space-y-2 border-t pt-3 text-sm">{o.items.map((i,index)=><li key={index}><b className="text-primary">{i.qty}×</b> {i.name}{i.note&&<p className="text-xs text-accent">↳ {i.note}</p>}</li>)}</ul>{o.note&&<p className="mt-3 text-sm text-muted-foreground">{o.note}</p>}
    </article>)}</div>{!list.length&&<p className="py-10 text-center text-muted-foreground">Nenhum atendimento encontrado.</p>}
  </main>;
}