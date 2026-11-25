import { afterEach, expect, it, vi } from 'vitest';
import { activateWhatsAppSound, refreshWhatsAppConversations } from '@/lib/whatsapp-alerts';
import { ORDER_ALARM_TONES, scheduleNotificationTones } from '@/lib/notification-tones';

const state=vi.hoisted(()=>({rows:[] as {id:string;phone:string;created_at:string;quoted_total:number;public_code:null;order_number:null;request:object}[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
  const response={data:table==='whatsapp_order_requests'?state.rows:[],error:null};
  const builder={select:()=>builder,order:()=>builder,limit:()=>builder,eq:()=>builder,is:()=>builder,then:(resolve:(value:typeof response)=>unknown)=>Promise.resolve(response).then(resolve)};
  return builder;
}}}));
vi.mock('@/lib/notification-tones',async importOriginal=>({...await importOriginal<typeof import('@/lib/notification-tones')>(),scheduleNotificationTones:vi.fn(()=>true)}));
afterEach(()=>vi.unstubAllGlobals());

it('a atualização do WhatsApp não repete som de pedido pendente nem aceito',async()=>{
  vi.stubGlobal('AudioContext',class {state='running';async resume(){}});
  await activateWhatsAppSound();
  const sounds=()=>vi.mocked(scheduleNotificationTones).mock.calls.filter(call=>call[1]===ORDER_ALARM_TONES).length;
  await refreshWhatsAppConversations();
  expect(sounds()).toBe(0);
  const row={id:'single-1',phone:'5573000000000',created_at:'2026-11-25T12:00:00Z',quoted_total:10,public_code:null,order_number:null,request:{}};
  state.rows=[row];
  await refreshWhatsAppConversations();
  expect(sounds()).toBe(1);
  for(let i=0;i<5;i++)await refreshWhatsAppConversations();
  expect(sounds()).toBe(1);
  state.rows=[];
  await refreshWhatsAppConversations();
  expect(sounds()).toBe(1);
  state.rows=[{...row,id:'single-2'}];
  await refreshWhatsAppConversations();
  expect(sounds()).toBe(2);
});