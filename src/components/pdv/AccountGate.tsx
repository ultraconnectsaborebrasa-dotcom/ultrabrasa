import { useEffect,useState,type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { openCloud,saveCloud,watchCloud } from '@/lib/pdv-cloud';
import { configurePersistence,hydrate,emptyDraft,replaceState,getState } from '@/lib/pdv-store';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
export function AccountGate({children}:{children:(admin:boolean,name:string,signOut:()=>Promise<void>)=>ReactNode}) {
 const [access,setAccess]=useState<{admin:boolean;name:string}|null>(null); const [error,setError]=useState('');const [busy,setBusy]=useState(true);const query=useQueryClient();const navigate=useNavigate();
 async function load(){setBusy(true);setError('');try{
 const {data,error}=await supabase.auth.getUser();if(error||!data.user){setError('Entre na sua conta para acessar o PDV.');return;}
 const claimed=await supabase.rpc('claim_pdv_admin');if(claimed.error)throw claimed.error;
 const roles=await supabase.from('user_roles').select('role').eq('user_id',data.user.id);if(roles.error)throw roles.error;
 if(!roles.data.length){setError('Seu acesso aguarda liberação pelo administrador.');return;}
 const profile=await supabase.from('profiles').select('display_name').eq('id',data.user.id).maybeSingle();
 hydrate();await openCloud();configurePersistence(saveCloud);setAccess({admin:roles.data.some(r=>r.role==='admin'),name:profile.data?.display_name??'Atendente'});
 }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar os dados.');}finally{setBusy(false);}}
 useEffect(()=>{void load();return()=>configurePersistence(null);},[]);
 useEffect(()=>{if(!access)return;return watchCloud();},[access]);
 async function signOut(){configurePersistence(null);setAccess(null);await query.cancelQueries();query.clear();replaceState({...getState(),draft:emptyDraft(),orders:[],products:[]});await supabase.auth.signOut();await navigate({to:'/auth',replace:true});}
 if(busy)return <div className="grid min-h-screen place-items-center text-muted-foreground">Carregando seu PDV…</div>;
 if(!access)return <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6"><h1 className="font-display text-3xl font-bold">Ultraconnect</h1><p role="alert">{error}</p><Button onClick={()=>navigate({to:'/auth'})}>Entrar na conta</Button><Button variant="outline" onClick={()=>void load()}>Verificar acesso</Button><Button variant="ghost" onClick={()=>void signOut()}>Sair</Button></div>;
 return <>{children(access.admin,access.name,signOut)}</>;
}
export function AdminTeam(){
 const [people,setPeople]=useState<{id:string;display_name:string;role:string}[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function load(){const p=await supabase.from('profiles').select('id,display_name');const r=await supabase.from('user_roles').select('user_id,role');if(p.error||r.error){setError('Não foi possível carregar a equipe.');return;}setPeople(p.data.map(x=>({...x,role:r.data.find(y=>y.user_id===x.id)?.role??''})));}
 useEffect(()=>{void load();},[]);
 async function assign(id:string,role:'admin'|'operator'){setBusy(true);const {error}=await supabase.rpc('set_pdv_role',{target:id,new_role:role});if(error)toast.error(error.message);else{toast.success('Acesso atualizado.');await load();}setBusy(false);}
 async function revoke(id:string){if(!confirm('Bloquear o acesso desta pessoa?'))return;setBusy(true);const {error}=await supabase.rpc('revoke_pdv_access',{target:id});if(error)toast.error(error.message);else{toast.success('Acesso bloqueado.');await load();}setBusy(false);}
 return <section className="space-y-4"><h2 className="text-2xl font-bold">Administração · Equipe</h2>{error&&<p role="alert">{error}</p>}<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-elevated text-left"><tr><th className="p-3">Nome</th><th>Acesso</th><th>Permissões</th></tr></thead><tbody>{people.map(p=><tr className="border-b" key={p.id}><td className="p-3">{p.display_name}</td><td>{p.role==='admin'?'Administrador':p.role==='operator'?'Atendente':'Aguardando liberação'}</td><td className="flex flex-wrap gap-2 py-3"><Button disabled={busy} variant="outline" size="sm" onClick={()=>void assign(p.id,'operator')}>Atendente</Button><Button disabled={busy} variant="outline" size="sm" onClick={()=>confirm('Conceder acesso total a esta pessoa?')&&void assign(p.id,'admin')}>Administrador</Button>{p.role&&<Button disabled={busy} variant="destructive" size="sm" onClick={()=>void revoke(p.id)}>Bloquear acesso</Button>}</td></tr>)}</tbody></table></div></section>;
}
