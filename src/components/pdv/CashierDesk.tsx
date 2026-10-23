import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Brand } from './Brand';
import { brl } from '@/lib/pdv-store';
import { toast } from 'sonner';

type Product = {id:string;name:string;category:string;price:number;stock:number|null;active:boolean};
type Order = {id:string;number:number;type:string;tableNumber?:number;customer:string;status:string;total:number;items:{name:string;qty:number;price:number}[]};
type CashierData = {products:Product[];orders:Order[];paymentMethods:string[]};
const empty:CashierData={products:[],orders:[],paymentMethods:[]};

export function CashierDesk({name,signOut}:{name:string;signOut:()=>Promise<void>}) {
 const [data,setData]=useState<CashierData>(empty);
 const [tab,setTab]=useState<'payments'|'products'>('payments');
 const [busy,setBusy]=useState(false);
 const [method,setMethod]=useState('');
 const [selected,setSelected]=useState<string|null>(null);
 const [edit,setEdit]=useState<Product|null>(null);
 const [form,setForm]=useState({name:'',category:'',price:'',stock:''});
 async function refresh(){const {data:result,error}=await supabase.rpc('read_pdv_cashier' as never);if(error){toast.error(error.message);return;}setData(result as unknown as CashierData);}
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[]);
 async function pay(){if(!selected||!method)return;setBusy(true);try{const {error}=await supabase.rpc('pay_pdv_cashier' as never,{order_id:selected,payment_method:method} as never);if(error)throw error;toast.success('Pagamento recebido');setSelected(null);setMethod('');await refresh();}catch(e){toast.error(e instanceof Error?e.message:'Falha no pagamento');}finally{setBusy(false);}}
 function start(p?:Product){setEdit(p??{id:'',name:'',category:'',price:0,stock:null,active:true});setForm({name:p?.name??'',category:p?.category??'',price:String(p?.price??''),stock:p?.stock===null||p===undefined?'':String(p.stock)});}
 async function save(){setBusy(true);try{const price=Number(form.price.replace(',','.'));const stock=form.stock.trim()===''?null:Number(form.stock);if(!form.name.trim()||!Number.isFinite(price)||price<0||(stock!==null&&(!Number.isInteger(stock)||stock<0))){toast.error('Confira nome, preço e estoque');return;}const {error}=await supabase.rpc('save_pdv_cashier_product' as never,{product_id:edit?.id||null,product_name:form.name,product_category:form.category,product_price:price,product_stock:stock} as never);if(error)throw error;toast.success('Produto salvo');setEdit(null);await refresh();}catch(e){toast.error(e instanceof Error?e.message:'Falha ao salvar');}finally{setBusy(false);}}
 return <div className="min-h-dvh p-5 space-y-5">
  <header className="flex flex-wrap items-center gap-3 border-b pb-4"><Brand/><div><h1 className="text-xl font-bold">Caixa · Ultrabrasa</h1><p className="text-sm text-muted-foreground">{name} · Acesso limitado</p></div><Button className="ml-auto" variant="outline" onClick={()=>void signOut()}>Sair</Button></header>
  <nav className="flex gap-2"><Button variant={tab==='payments'?'default':'outline'} onClick={()=>setTab('payments')}>Receber pagamentos</Button><Button variant={tab==='products'?'default':'outline'} onClick={()=>setTab('products')}>Estoque e produtos</Button></nav>
  {tab==='payments'?<section className="space-y-4"><h2 className="text-lg font-bold">Comandas para receber</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.orders.map(o=><article key={o.id} className="rounded-xl border p-4 space-y-3"><div className="flex justify-between"><b>Comanda #{o.number}</b><span>{o.type}{o.tableNumber?' '+o.tableNumber:''}</span></div><p className="text-sm">{o.customer}</p><ul className="text-sm">{o.items?.map((i,n)=><li key={n}>{i.qty}× {i.name}</li>)}</ul><div className="flex items-center justify-between border-t pt-3"><b>{brl(o.total)}</b><Button onClick={()=>{setSelected(o.id);setMethod('');}}>Receber</Button></div></article>)}</div>{!data.orders.length&&<p className="text-muted-foreground">Nenhuma comanda aguardando pagamento.</p>}</section>:<section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Estoque e cadastro</h2><Button onClick={()=>start()}>Novo produto</Button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Ação</th></tr></thead><tbody>{data.products.map(p=><tr className="border-b" key={p.id}><td className="p-2">{p.name}</td><td>{p.category}</td><td>{brl(p.price)}</td><td>{p.stock??'Sem controle'}</td><td><Button size="sm" variant="outline" onClick={()=>start(p)}>Editar</Button></td></tr>)}</tbody></table></div></section>}
  {selected&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><div className="w-full max-w-md space-y-4 rounded-xl bg-background p-6"><h2 className="text-xl font-bold">Confirmar recebimento</h2><p>Total: {brl(data.orders.find(o=>o.id===selected)?.total??0)}</p><select className="field w-full" value={method} onChange={e=>setMethod(e.target.value)}><option value="">Selecione a forma de pagamento</option>{data.paymentMethods.map(m=><option key={m} value={m}>{m}</option>)}</select><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setSelected(null)}>Cancelar</Button><Button disabled={busy||!method} onClick={()=>void pay()}>Confirmar pagamento</Button></div></div></div>}
  {edit&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><div className="w-full max-w-md space-y-3 rounded-xl bg-background p-6"><h2 className="text-xl font-bold">{edit.id?'Editar produto':'Cadastrar produto'}</h2>{(['name','category','price','stock'] as const).map(k=><label key={k} className="block text-sm capitalize">{({name:'Nome',category:'Categoria',price:'Preço de venda',stock:'Estoque (vazio = sem controle)'})[k]}<input className="field mt-1 w-full" value={form[k]} onChange={e=>setForm(v=>({...v,[k]:e.target.value}))}/></label>)}<div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setEdit(null)}>Cancelar</Button><Button disabled={busy} onClick={()=>void save()}>Salvar</Button></div></div></div>}
 </div>;
}
