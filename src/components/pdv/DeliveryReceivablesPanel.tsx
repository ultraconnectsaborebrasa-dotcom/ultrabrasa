import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { brl } from '@/lib/pdv-store';
import { deliveryReceivablesQuery } from '@/lib/delivery-payment';
import { DeliveryPaymentDialog } from './DeliveryPaymentDialog';

export function DeliveryReceivablesPanel({ date, courier = false, onPaid }: { date: string; courier?: boolean; onPaid?: () => Promise<void> }) {
  const query = useQuery(deliveryReceivablesQuery(date));
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const normalized = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const orders = (query.data?.orders ?? []).filter(order => (courier || normalized) && `${order.number} ${order.customer} ${order.courier_name ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(normalized));
  return <section className="space-y-3">
    <h3 className="font-semibold">{courier ? 'Meus pedidos com valor pendente' : 'Pedidos com valor pendente'}</h3>
    <label className="flex items-center gap-2 rounded-lg border px-3"><Search size={18} className="shrink-0 text-muted-foreground" /><input type="search" aria-label="Buscar recebimento pendente" placeholder="Pedido, cliente ou entregador" className="h-12 w-full min-w-0 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {query.error && <p role="alert" className="text-destructive">{query.error.message}</p>}
    {query.isPending && <p role="status">Carregando pendências…</p>}
    {!courier && !normalized && <p className="border-b py-8 text-center text-sm text-muted-foreground">Nenhum pedido selecionado</p>}
    {(courier || normalized) && !query.isPending && !query.error && !orders.length && <p role="status" className="py-6 text-center text-sm text-muted-foreground">Nenhum recebimento pendente encontrado.</p>}
    <div className="divide-y">{orders.map(order => <article key={order.id} className="space-y-3 py-4"><div className="flex flex-wrap justify-between gap-2"><h4 className="min-w-0 break-words font-semibold">#{order.number} · {order.customer || 'Cliente'}</h4><strong className="text-warning">{brl(order.total)}</strong></div><p className="text-sm text-muted-foreground">{order.courier_name || 'Sem entregador designado'} · {order.status}</p><Button variant="outline" onClick={() => setSelected(order.id)}><CircleDollarSign size={16} />Conferir pedido e receber</Button></article>)}</div>
    {selected && <DeliveryPaymentDialog orderId={selected} date={date} onClose={() => setSelected(null)} {...(onPaid ? { onPaid } : {})} />}
  </section>;
}