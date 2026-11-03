import {describe,it,expect,vi,beforeEach} from 'vitest';
import {defaultBusiness} from '@/lib/whatsapp-business';
vi.mock('@/lib/whatsapp.server',()=>({gateway:vi.fn(),sendText:vi.fn(),sendTyping:vi.fn(),digits:(s:string)=>s.replace(/\D/g,'')}));
vi.mock('@lovable.dev/ai-gateway',()=>({generateResponse:vi.fn(),GatewayError:class GatewayError extends Error{}}));
import {processJobs} from '@/lib/whatsapp-automation.server';
import {sendText} from '@/lib/whatsapp.server';
type Db=Parameters<typeof processJobs>[0];
function mockDb({paused=false,enabled=true,windowOpen=true,state='ok'}={}){
 const updates:Record<string,unknown>[]=[];let claims=0;
 const db={from:(table:string)=>{let mode='read';const q={select:()=>q,eq:()=>q,single:async()=>({data:table==='whatsapp_settings'?{business:defaultBusiness,account_state:state,auto_reply_enabled:enabled}:{automation_paused:paused,last_inbound_at:windowOpen?new Date().toISOString():new Date(Date.now()-25*3600000).toISOString()},error:null}),maybeSingle:async()=>({data:null,error:null}),update:(data:Record<string,unknown>)=>{updates.push(data);mode='update';return q;},then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({data:mode==='update'?null:[],error:null}).then(resolve)};return q;},rpc:async()=>({data:claims++===0?[{id:'job-1',phone:'5573999999999',kind:'text',payload:{text:'Teste',automatic:true}}]:[],error:null})};return {db:db as unknown as Db,updates};
}
describe('WhatsApp guarded job processing',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('does not send after a human pauses the conversation',async()=>{const{db,updates}=mockDb({paused:true});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();expect(updates).toContainEqual({state:'cancelled'});});
 it('does not send automation when globally disabled',async()=>{const{db}=mockDb({enabled:false});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();});
 it('never sends free-form text outside the 24 hour window',async()=>{const{db,updates}=mockDb({windowOpen:false});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();expect(updates.some(u=>u['state']==='unknown')).toBe(true);});
 it('does not send when the account is blocked',async()=>{const{db}=mockDb({state:'blocked'});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();});
 it('bounds sends to the requested batch size',async()=>{const{db}=mockDb();vi.mocked(sendText).mockResolvedValue('wamid.test');await processJobs(db,1);expect(sendText).toHaveBeenCalledTimes(1);});
});