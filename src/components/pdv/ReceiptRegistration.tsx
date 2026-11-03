import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { retryReceiptAnalysis } from '@/lib/receipt-actions.functions';

export function ReceiptRegistration({phone,orderId,onSaved}:{phone?:string|undefined;orderId?:string|undefined;onSaved?:(()=>void)|undefined}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const [orders,setOrders]=useState<{id:string;number:number;customer:string;customerPhone?:string;status:string}[]>([]);
  const [messages,setMessages]=useState<{id:string;body:string|null;provider_at:string}[]>([]);
  const [selectedOrder,setSelectedOrder]=useState(orderId??''),[messageId,setMessageId]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const retry=useServerFn(retryReceiptAnalysis);
  useEffect(()=>{if(!open)return;setSelectedOrder(orderId??'');setFile(null);setMessageId('');void (async()=>{const role=await supabase.rpc('has_role',{_user_id:(await supabase.auth.getUser()).data.user?.id??'',_role:'admin'});const r=role.data?await supabase.from('pdv_state').select('data').eq('id',1).single():await supabase.rpc('read_pdv_cashier');if(r.error){toast.error(r.error.message);return;}const data=(role.data?(r.data as {data:unknown}).data:r.data) as {orders:typeof orders};setOrders(data.orders.filter(o=>['aberta','cozinha','pronto','pago'].includes(o.status)&&(!phone||o.customerPhone?.replace(/\D/g,'')===phone)));})();},[open,phone,orderId]);
  const selected=orders.find(o=>o.id===selectedOrder);
  const customerPhone=phone??selected?.customerPhone;
  useEffect(()=>{if(!open||!customerPhone){setMessages([]);return;}void supabase.from('whatsapp_messages').select('id,body,provider_at').eq('phone',customerPhone.replace(/\D/g,'')).eq('direction','in').in('kind',['image','document']).order('provider_at',{ascending:false}).limit(30).then(r=>{if(r.error)toast.error(r.error.message);else setMessages(r.data);});},[open,customerPhone]);
  async function save(){if(!selectedOrder||(!messageId&&!file))return;setBusy(true);try{
    let path:string|null=null;
    if(file){if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw new Error('Selecione imagem ou PDF até 5 MB');const user=await supabase.auth.getUser();if(user.error||!user.data.user)throw new Error('Entre na sua conta');path=`${user.data.user.id}/${crypto.randomUUID()}.${file.type==='application/pdf'?'pdf':file.type.split('/')[1]}`;const upload=await supabase.storage.from('payment-receipts').upload(path,file,{contentType:file.type});if(upload.error)throw upload.error;}
    const saved=await supabase.rpc('register_staff_receipt',{_message:file?null:messageId,_path:path,_order:selectedOrder} as never);
    if(saved.error)throw saved.error;toast.success('Pago — conferir comprovante');setOpen(false);onSaved?.();
  }catch(e){toast.error(e instanceof Error?e.message:'Não foi possível registrar');}finally{setBusy(false);}}
  return <><Button size="sm" variant="outline" onClick={()=>setOpen(true)}>Marcar comprovante recebido</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Marcar comprovante recebido</DialogTitle></DialogHeader><label className="text-sm">Pedido<select aria-label="Pedido do comprovante" className="field mt-1 w-full" value={selectedOrder} onChange={e=>setSelectedOrder(e.target.value)}><option value="">Selecionar pedido</option>{orders.map(o=><option key={o.id} value={o.id}>#{o.number} · {o.customer||'Cliente'}</option>)}</select></label><label className="text-sm">Arquivo recebido<select aria-label="Arquivo recebido" className="field mt-1 w-full" value={messageId} onChange={e=>{setMessageId(e.target.value);setFile(null);}}><option value="">Selecionar imagem ou PDF</option>{messages.map(m=><option key={m.id} value={m.id}>{new Date(m.provider_at).toLocaleString('pt-BR')} · {m.body?.slice(0,60)}</option>)}</select></label>{messageId&&<Button disabled={busy} variant="outline" onClick={()=>{setBusy(true);void retry({data:{messageId}}).then(()=>toast.success('Arquivo analisado')).catch(e=>toast.error(e.message)).finally(()=>setBusy(false));}}>Tentar analisar novamente</Button>}<label className="text-sm">Anexar comprovante<input aria-label="Anexar comprovante" className="field mt-1 w-full" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>{setFile(e.target.files?.[0]??null);setMessageId('');}}/></label><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button disabled={busy||!selectedOrder||(!messageId&&!file)} onClick={()=>void save()}>Registrar comprovante</Button></div></DialogContent></Dialog></>;
}