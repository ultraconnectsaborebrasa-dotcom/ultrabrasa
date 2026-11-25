import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor, fireEvent, screen } from '@testing-library/react';
import { CourierLocationSharing } from '@/components/pdv/CourierLocationSharing';
const { rpc, data }=vi.hoisted(()=>({rpc:vi.fn().mockResolvedValue({error:null}),data:{current_courier_id:'courier',locations:[],time_entries:[{courier_id:'courier',exit_at:null}]}}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data,error:null})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
vi.mock('@/lib/android-device.functions',()=>({createAndroidDevicePair:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({useServerFn:()=>vi.fn().mockResolvedValue({code:'a'.repeat(32),expiresAt:Date.now()+300000})}));
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();vi.unstubAllGlobals();});
function gps(){const get=vi.fn((success:(position:unknown)=>void)=>success({coords:{latitude:-16,longitude:-39,accuracy:10}}));const watch=vi.fn(()=>1);Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:get,watchPosition:watch,clearWatch:vi.fn()}});return {get,watch};}
describe('Localização ao abrir o aplicativo',()=>{
 it('solicita permissão sem depender de abrir o mapa',async()=>{const {get}=gps();render(<CourierLocationSharing/>);await waitFor(()=>expect(get).toHaveBeenCalledOnce());});
 it('respeita compartilhamento desativado pelo entregador',async()=>{localStorage.setItem('courier-gps-courier','off');const {get,watch}=gps();render(<CourierLocationSharing/>);await screen.findByText('Localização desativada por você.');expect(get).not.toHaveBeenCalled();expect(watch).not.toHaveBeenCalled();});
 it('desativar remove a posição compartilhada',async()=>{gps();render(<CourierLocationSharing/>);await screen.findByRole('button',{name:'Desativar'});fireEvent.click(screen.getByRole('button',{name:'Desativar'}));await waitFor(()=>expect(rpc).toHaveBeenCalledWith('disable_courier_location'));expect(localStorage.getItem('courier-gps-courier')).toBe('off');});
 it('no Android nativo não duplica aquisição de GPS pelo navegador e permite desativar pelo servidor',async()=>{const {get,watch}=gps();vi.stubGlobal('navigator',{geolocation:navigator.geolocation,userAgent:'UltraconnectEntregas/1.2'});render(<CourierLocationSharing/>);const disable=await screen.findByRole('button',{name:'Desativar GPS'});expect(get).not.toHaveBeenCalled();expect(watch).not.toHaveBeenCalled();fireEvent.click(disable);await waitFor(()=>expect(rpc).toHaveBeenCalledWith('disable_courier_location'));});
});