import { useEffect,useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { DeliveryFields } from './DeliveryFields';
import { addressText,emptyDelivery,validateDelivery,type DeliveryAddress,type DeliveryInput } from '@/lib/delivery';
export function CustomerAddresses({customerId,onClose}:{customerId:string;onClose:()=>void}){
 const [rows,setRows]=useState<{id:string;address:DeliveryAddress}[]>([]);const [editing,setEditing]=useState<string|null>(null);const [form,setForm]=useState<DeliveryInput>(emptyDelivery);const [busy,setBusy]=useState(false);
 async function load(){const {data,error}=await supabase.from('delivery_addresses').select('id,address').eq('customer_id',customerId);if(error)toast.error(error.message);else setRows(data as unknown as typeof rows);}
 useEffect(()=>{void load();},[customerId]);
 async function save(){const err=validateDelivery(form);if(err){toast.error(err);return;}setBusy(true);const {error}=await supabase.rpc('save_customer_delivery_address',{customer:customerId,address_id:editing??undefined,input:form.address as unknown as Json});setBusy(false);if(error)toast.error(error.message);else{toast.success('Endereço salvo.');setEditing(null);setForm(emptyDelivery());await load();}}
 return <div role="dialog" aria-modal="true" aria-label="Endereços do cliente" className="fixed inset-0 z-50 overflow-y-auto bg-background/95 p-4"><div className="mx-auto max-w-lg space-y-4 py-4"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Endereços do cliente</h2><Button variant="outline" onClick={onClose}>Fechar</Button></div>{rows.map(r=><div key={r.id} className="border-b py-3"><b>{r.address.label}</b><p className="text-sm text-muted-foreground">{addressText(r.address)}</p><Button variant="outline" size="sm" onClick={()=>{setEditing(r.id);setForm({...emptyDelivery(),address:r.address});}}>Editar</Button></div>)}<Button variant="outline" onClick={()=>{setEditing(null);setForm(emptyDelivery());}}>Novo endereço</Button><DeliveryFields lookup={false} value={form} onChange={setForm}/><Button disabled={busy} onClick={()=>void save()}>Salvar endereço</Button></div></div>;
}