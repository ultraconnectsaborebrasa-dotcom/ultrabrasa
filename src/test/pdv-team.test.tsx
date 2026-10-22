import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AdminTeam } from '@/components/pdv/AccountGate';
const rpc=vi.fn().mockResolvedValue({error:null});
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>rpc(...args),from:(table:string)=>({select:()=>Promise.resolve({error:null,data:table==='profiles'?[{id:'admin',display_name:'Admin'},{id:'seller',display_name:'Vendedor'}]:[{user_id:'admin',role:'admin'},{user_id:'seller',role:'operator'}]})})}}));
afterEach(()=>{cleanup();rpc.mockClear();});
describe('Exclusão protegida de atendente',()=>{
 it('cancelar a confirmação não revoga o acesso',async()=>{
  render(<AdminTeam/>);fireEvent.click(await screen.findByRole('button',{name:'Excluir atendente'}));
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(rpc).not.toHaveBeenCalled();
 });
 it('confirmar revoga somente o acesso do atendente',async()=>{
  render(<AdminTeam/>);fireEvent.click(await screen.findByRole('button',{name:'Excluir atendente'}));
  fireEvent.click(screen.getByRole('button',{name:'Confirmar exclusão'}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledExactlyOnceWith('revoke_pdv_access',{target:'seller'}));
 });
});