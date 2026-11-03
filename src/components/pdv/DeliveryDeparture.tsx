import {useState} from 'react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {supabase} from '@/integrations/supabase/client';
export function DeliveryDeparture({orderId,onSaved}:{orderId:string;onSaved?:(()=>void)|undefined}){
 const[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[courier,setCourier]=useState('');const[couriers,setCouriers]=useState<{id:string;name:string}[]>([]);
 async function start(){setOpen(true);const r=await supabase.from('delivery_couriers').select('id,name').eq('active',true);if(r.error)toast.error(r.error.message);else setCouriers(r.data);}
 async function save(){setBusy(true);try{const r=await supabase.rpc('depart_delivery',{_order:orderId,...(courier?{_courier:courier}:{})});if(r.error)throw r.error;toast.success('Saiu para entrega');setOpen(false);onSaved?.();}catch(e){toast.error(e instanceof Error?e.message:'Não foi possível registrar a saída');}finally{setBusy(false);}}
 return <><Button size="sm" onClick={()=>void start()}>Saiu para entrega</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Saiu para entrega</DialogTitle></DialogHeader><label className="text-sm">Entregador<select aria-label="Entregador da saída" className="field mt-1 w-full" value={courier} onChange={e=>setCourier(e.target.value)}><option value="">Sem entregador informado</option>{couriers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button disabled={busy} onClick={()=>void save()}>Confirmar saída</Button></div></DialogContent></Dialog></>;
}