import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { submitManualPayment } from '@/lib/manual-payment';
import { brl } from '@/lib/pdv-store';
import { toast } from 'sonner';

export function ManualPaymentDialog({order,methods,markReady=false,onClose,onPaid}:{order:{id:string;number:number;total:number};methods:string[];markReady?:boolean;onClose:()=>void;onPaid:(method:string)=>void|Promise<void>}) {
 const [method,setMethod]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
 async function confirm(){if(lock.current||!method)return;lock.current=true;setBusy(true);
  try{await submitManualPayment(order.id,method,markReady);await onPaid(method);toast.success(markReady?`Pedido #${order.number} pago e baixado`:`Pedido #${order.number} pago`);onClose();}
  catch(e){toast.error(e instanceof Error?e.message:(e as {message?:string})?.message??'Não foi possível dar baixa. Tente novamente.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Dar baixa · Pedido #{order.number}</DialogTitle></DialogHeader><div className="flex items-center justify-between border-y py-4"><span>Valor a receber</span><strong className="text-2xl text-primary">{brl(order.total)}</strong></div><label className="space-y-2 text-sm">Forma de pagamento<select aria-label="Forma de pagamento" className="field w-full" value={method} disabled={busy} onChange={e=>setMethod(e.target.value)}><option value="">Selecione</option>{methods.map(m=><option key={m} value={m}>{m}</option>)}</select></label><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Voltar</Button><Button disabled={busy||!method} onClick={()=>void confirm()}>{busy?'Salvando…':markReady?'Receber e dar baixa':'Confirmar baixa'}</Button></div></DialogContent></Dialog>;
}