import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { getState, replaceState, type State } from './pdv-store';
let revision=0;
let tail: Promise<void> = Promise.resolve();
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
