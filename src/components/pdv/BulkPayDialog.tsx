import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { brl } from '@/lib/pdv-store';
import { toast } from 'sonner';

export function BulkPayDialog({orders,methods,onClose,onDone}:{orders:{id:string;number:number;total:number}[];methods:string[];onClose:()=>void;onDone:()=>void|Promise<void>}){
 const [method,setMethod]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
 const total=orders.reduce((s,o)=>s+o.total,0);
 async function confirm(){if(lock.current||!method)return;lock.current=true;setBusy(true);let ok=0;const failed:number[]=[];
  for(const o of orders){const {error}=await supabase.rpc('pay_pdv_cashier' as never,{order_id:o.id,payment_method:method} as never);if(error)failed.push(o.number);else ok++;}
  await onDone();lock.current=false;setBusy(false);
  if(ok)toast.success(`${ok} pedido(s) marcados como pagos em ${method}`);
  if(failed.length)toast.error(`Não deu baixa: #${failed.join(', #')}. Confira e tente de novo.`);else onClose();
 }
 return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Dar baixa em todos · {orders.length} pedido(s)</DialogTitle></DialogHeader><div className="flex items-center justify-between border-y py-4"><span>Total a receber</span><strong className="text-2xl text-primary">{brl(total)}</strong></div><label className="space-y-2 text-sm">Forma de pagamento (para todos)<select aria-label="Forma de pagamento" className="field w-full" value={method} disabled={busy} onChange={e=>setMethod(e.target.value)}><option value="">Selecione</option>{methods.map(m=><option key={m} value={m}>{m}</option>)}</select></label><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Voltar</Button><Button disabled={busy||!method||!orders.length} onClick={()=>void confirm()}>{busy?'Salvando…':'Confirmar baixa de todos'}</Button></div></DialogContent></Dialog>;
}
