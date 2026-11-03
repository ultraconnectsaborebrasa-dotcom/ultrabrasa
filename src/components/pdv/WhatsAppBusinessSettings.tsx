import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {businessSchema,initialLunchMessage,type Business} from '@/lib/whatsapp-business';
import {whatsappSaveBusiness} from '@/lib/whatsapp-attendance.functions';
import {supabase} from '@/integrations/supabase/client';
import {useStore} from '@/lib/pdv-store';
export function WhatsAppBusinessSettings({initial,enabled,quick,onSaved}:{initial:Business;enabled:boolean;quick:string[];onSaved:()=>void}){
 const[b,setB]=useState(initial);const[on,setOn]=useState(enabled);const[q,setQ]=useState(quick.join('\n'));const[busy,setBusy]=useState(false);const save=useServerFn(whatsappSaveBusiness);const products=useStore(s=>s.products);
 const field=(key:'lunchMenu'|'pixKey'|'demandText',label:string)=><label className="space-y-1 text-sm">{label}{key==='pixKey'?<input className="field" value={b[key]} onChange={e=>setB({...b,[key]:e.target.value})}/>:<textarea className="field min-h-20" value={b[key]} onChange={e=>setB({...b,[key]:e.target.value})}/>}</label>;
 async function upload(file:File|undefined){if(!file)return;if(file.type!=='application/pdf'||file.size>5*1024*1024){toast.error('Selecione um PDF de até 5 MB');return;}if(new TextDecoder().decode((await file.slice(0,5).arrayBuffer()))!=='%PDF-'){toast.error('Arquivo PDF inválido');return;}setBusy(true);try{const path=`menus/${crypto.randomUUID()}.pdf`;const r=await supabase.storage.from('whatsapp-menu').upload(path,file,{contentType:'application/pdf'});if(r.error)throw r.error;setB({...b,pdfPath:path});toast.success('PDF carregado; salve as configurações');}catch(e){toast.error(e instanceof Error?e.message:'Falha no PDF');}finally{setBusy(false);}}
 async function submit(){setBusy(true);try{await save({data:{business:businessSchema.parse(b),enabled:on,quickReplies:q.split('\n').map(s=>s.trim()).filter(Boolean)}});toast.success('Configurações salvas');onSaved();}catch(e){toast.error(e instanceof Error?e.message:'Falha');}finally{setBusy(false);}}
 return <div className="space-y-4 border-b pb-4">
 <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={on} onChange={e=>setOn(e.target.checked)}/>Automação ativa</label><label className="flex items-center gap-2"><input type="checkbox" checked={b.freeDelivery} onChange={e=>setB({...b,freeDelivery:e.target.checked})}/>Entrega grátis em Eunápolis</label><label className="flex items-center gap-2"><input type="checkbox" checked={b.highDemand} onChange={e=>setB({...b,highDemand:e.target.checked})}/>Aviso de alta procura</label></div>
 {b.circuitPaused&&<div role="alert" className="border-l-2 border-destructive p-2 text-sm">Automação pausada: {b.circuitReason}<Button variant="outline" size="sm" onClick={()=>setB({...b,circuitPaused:false,circuitReason:''})}>Retomar após resolver</Button></div>}
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {field('lunchMenu','Composição da marmita')}{field('pixKey','Chave Pix')}{field('demandText','Mensagem de alta procura')}
 <label className="text-sm">Preço da marmita<input type="number" min="0.01" step="0.01" className="field" value={b.lunchPrice} onChange={e=>setB({...b,lunchPrice:Number(e.target.value)})}/></label>
 <label className="text-sm">Produto da marmita no PDV<select className="field" value={b.lunchProductId} onChange={e=>setB({...b,lunchProductId:e.target.value})}><option value="">Escolher produto existente</option>{products.filter(p=>p.active).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
 <label className="text-sm">Lembrete sem resposta/aceite (min)<input className="field" type="number" min="1" max="120" value={b.reminderMinutes} onChange={e=>setB({...b,reminderMinutes:Number(e.target.value)})}/></label>
 <label className="text-sm">Pedidos antecipados a partir de<input className="field" type="time" value={b.advanceFrom} onChange={e=>setB({...b,advanceFrom:e.target.value})}/></label>
 <label className="text-sm">Entregas começam a sair às<input className="field" type="time" value={b.departureFrom} onChange={e=>setB({...b,departureFrom:e.target.value})}/></label>
 <label className="text-sm">Cardápio PDF (até 5 MB)<input aria-label="Cardápio PDF" type="file" accept="application/pdf" onChange={e=>void upload(e.target.files?.[0])}/><span className="block text-xs text-muted-foreground">{b.pdfPath?'PDF cadastrado':'Nenhum PDF cadastrado'}</span></label>
 </div>
 <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Dia</th><th>Fim do almoço</th><th>Abre à noite</th><th>Fecha à noite</th></tr></thead><tbody>{['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'].map((day,i)=><tr key={day}><td>{day}</td>{(['lunchEnd','nightStart','nightEnd'] as const).map(key=><td className="p-1" key={key}><input aria-label={`${day} ${key}`} type="time" className="field" value={b.hours.find(h=>h.day===i)?.[key]??''} onChange={e=>{const h=b.hours.find(h=>h.day===i)??{day:i,lunchEnd:'',nightStart:'',nightEnd:''};setB({...b,hours:[...b.hours.filter(x=>x.day!==i),{...h,[key]:e.target.value}]});}}/></td>)}</tr>)}</tbody></table></div>
 <label className="block text-sm">Respostas rápidas (uma por linha)<textarea className="field min-h-20" value={q} onChange={e=>setQ(e.target.value)}/></label>
 <details><summary className="cursor-pointer text-sm font-semibold">Prévia da apresentação</summary><p className="whitespace-pre-wrap border-l-2 border-primary p-3 text-sm">{initialLunchMessage(b)}</p></details>
 <Button disabled={busy} onClick={()=>void submit()}>Salvar configurações</Button>
 </div>;
}