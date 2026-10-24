import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useSyncExternalStore } from 'react';
import { getState, replaceState, isSaving, subscribeState, type State } from './pdv-store';
import { mergeSnapshot, type SharedSnapshot } from './pdv-sync';
import { toast } from 'sonner';
import { printOrder, printerPreferences } from '@/services/thermalPrinter';
import { loadOrderAlerts } from './order-alerts';
export { useOrderAlerts, toggleOrderAlerts } from './order-alerts';
let revision=0;
let tail: Promise<void> = Promise.resolve();
type SyncStatus = 'connecting'|'live'|'offline';
let status:SyncStatus='connecting';
const statusListeners=new Set<()=>void>();
function setStatus(next:SyncStatus){status=next;statusListeners.forEach(l=>l());}
export function useSyncStatus(){return useSyncExternalStore(l=>{statusListeners.add(l);return()=>{statusListeners.delete(l);};},()=>status,()=>'connecting' as SyncStatus);}
export function watchCloud(){
 loadOrderAlerts();
 let active=true;let pending:SharedSnapshot|null=null;
 function receive(snapshot:SharedSnapshot){
  if(!active)return;
  if(isSaving()){if(!pending||pending.revision<snapshot.revision)pending=snapshot;return;}
  const current=getState();const merged=mergeSnapshot(current,snapshot,revision);if(!merged)return;
  const incoming=merged.orders.filter(o=>o.status==='cozinha'&&!current.orders.some(p=>p.id===o.id&&p.status==='cozinha'));
  revision=snapshot.revision;replaceState(merged);
  if(printerPreferences.autoPrintEnabled)incoming.forEach(o=>{void printOrder(o,merged.settings.serviceFeePct,{target:'kitchen'}).catch((error:unknown)=>{const detail=error instanceof Error?error.message:'verifique a conexão e a impressora selecionada';toast.error(`Comanda #${o.number} recebida, mas não foi possível imprimir: ${detail}`);});});
 }
 async function refresh(){const {data,error}=await supabase.from('pdv_state').select('data,revision').eq('id',1).maybeSingle();if(!active)return;if(error){setStatus('offline');return;}if(data)receive(data);}
 const unsubscribe=subscribeState(()=>{if(pending&&!isSaving()){const next=pending;pending=null;receive(next);}});
 const channel=supabase.channel('pdv-live-devices').on('postgres_changes',{event:'*',schema:'public',table:'pdv_state',filter:'id=eq.1'},p=>{if('revision' in p.new)receive(p.new as SharedSnapshot);}).subscribe(s=>{if(!active)return;if(s==='SUBSCRIBED'){setStatus('live');void refresh();}else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT'||s==='CLOSED')setStatus('offline');});
 const poll=setInterval(()=>void refresh(),3000);
 const online=()=>{setStatus('connecting');void refresh();};const offline=()=>setStatus('offline');const focus=()=>{if(document.visibilityState==='visible')void refresh();};
 window.addEventListener('online',online);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',focus);
 return()=>{active=false;clearInterval(poll);unsubscribe();void supabase.removeChannel(channel);window.removeEventListener('online',online);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',focus);setStatus('connecting');};
}
export async function openCloud() {
 const {data,error}=await supabase.from('pdv_state').select('data,revision').eq('id',1).maybeSingle();
 if(error)throw error;
 revision=data?.revision??0;
 if(data) replaceState({...data.data as unknown as State,draft:getState().draft});
 else await saveCloud(getState());
}
export function saveCloud(state:State) {
 const payload = JSON.parse(JSON.stringify({...state,draft:undefined})) as Json;
 const task=tail.then(async()=>{
  const {data,error}=await supabase.rpc('save_pdv_state',{payload,expected_revision:revision});
  if(error)throw error;
  revision=data.revision;
  replaceState({...data.data as unknown as State,draft:getState().draft});
 });
 tail=task.catch(()=>{}); return task;
}
