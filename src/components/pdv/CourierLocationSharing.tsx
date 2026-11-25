import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LocateFixed } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { saoPauloDay, shouldSendCourierPosition, type CourierOperations } from '@/lib/courier-operations';

export function CourierLocationSharing() {
  const query = useQuery({ queryKey: ['courier-location-sharing'], queryFn: async () => {
    const day = saoPauloDay();const { data, error } = await supabase.rpc('read_courier_operations', { p_from: day, p_to: day });
    if (error) throw new Error(error.message);return data as unknown as CourierOperations;
  }, refetchInterval: 15000, gcTime: 0 });
  const id = query.data?.current_courier_id;
  const open = query.data?.time_entries.some(entry => entry.courier_id === id && entry.exit_at === null) ?? false;
  const [sharing, setSharing] = useState(false);
  const [permission, setPermission] = useState(false);
  const [status, setStatus] = useState('');
  const last = useRef<{latitude:number;longitude:number;sentAt:number}|null>(null);
  useEffect(() => {
    if (!id || !navigator.geolocation) return;
    let active = true;
    const enabled = localStorage.getItem(`courier-gps-${id}`) !== 'off';setSharing(enabled);
    if (!enabled) { setStatus('Localização desativada por você.');return; }
    setStatus('Aguardando autorização de localização do celular…');
    navigator.geolocation.getCurrentPosition(() => { if (active) { setPermission(true);setStatus('Localização autorizada.'); } }, error => {
      if (active) { setPermission(false);setStatus(error.code === 1 ? 'Acesso negado. Permita localização nas configurações do celular.' : 'Não foi possível obter o GPS. Confira a localização do celular.'); }
    }, {enableHighAccuracy:true,timeout:15000,maximumAge:10000});
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    if (!sharing || !permission || !open || !navigator.geolocation) return;
    let active = true;let watch: number | null = null;
    const stop = () => { if (watch !== null) navigator.geolocation.clearWatch(watch);watch=null; };
    const start = () => {
      stop();if (document.visibilityState !== 'visible') return;
      watch=navigator.geolocation.watchPosition(position => {
        const next={latitude:position.coords.latitude,longitude:position.coords.longitude};const now=Date.now();
        if (!shouldSendCourierPosition(last.current,next,now)) return;
        void supabase.rpc('update_courier_location',{p_latitude:next.latitude,p_longitude:next.longitude,p_accuracy:position.coords.accuracy}).then(({error})=>{
          if (!active) return;
          if(error)setStatus(error.message);else {last.current={...next,sentAt:now};setStatus(`GPS compartilhado às ${new Date(now).toLocaleTimeString('pt-BR')}.`);}
        });
      }, error=>{if(active)setStatus(error.code===1?'Permissão de localização revogada.':error.message);},{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
    };
    start();document.addEventListener('visibilitychange',start);
    return ()=>{active=false;stop();document.removeEventListener('visibilitychange',start);};
  },[sharing,permission,open]);
  async function toggle(){
    if(!id)return;
    if(sharing){setSharing(false);localStorage.setItem(`courier-gps-${id}`,'off');const {error}=await supabase.rpc('disable_courier_location');setStatus(error?.message??'Localização desativada.');}
    else{localStorage.setItem(`courier-gps-${id}`,'on');setSharing(true);last.current=null;
      navigator.geolocation?.getCurrentPosition(()=>{setPermission(true);setStatus('Localização autorizada.');},()=>setStatus('Autorize a localização nas configurações do celular.'),{enableHighAccuracy:true,timeout:15000});}
  }
  return <section className="space-y-2 border-y py-3"><div className="flex flex-wrap items-center gap-2"><h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold"><LocateFixed size={18} className={sharing&&permission&&open?'text-success':'text-warning'}/>Minha localização</h2><Button size="sm" variant="outline" disabled={!id} onClick={()=>void toggle()}>{sharing?'Desativar':'Autorizar localização'}</Button></div><p role="status" className="text-xs text-muted-foreground">{query.error?.message??status}{permission&&sharing&&!open?' Compartilhamento começa após registrar a entrada do turno.':''}</p><p className="text-xs text-muted-foreground">Compartilhada durante o turno com o aplicativo aberto; desativada quando você sai do turno.</p></section>;
}