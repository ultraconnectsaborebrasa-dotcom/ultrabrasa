import {describe,it,expect,vi,beforeEach} from 'vitest';
import {defaultBusiness} from '@/lib/whatsapp-business';
vi.mock('@/lib/whatsapp.server',()=>({gateway:vi.fn(),sendText:vi.fn(),sendTyping:vi.fn(),digits:(s:string)=>s.replace(/\D/g,'')}));
vi.mock('@lovable.dev/ai-gateway',()=>({generateResponse:vi.fn(),GatewayError:class GatewayError extends Error{}}));
vi.mock('@/lib/payment-receipts.server',()=>({processReceipt:vi.fn()}));
import {processJobs} from '@/lib/whatsapp-automation.server';
import {sendText,sendTyping} from '@/lib/whatsapp.server';
import {processReceipt} from '@/lib/payment-receipts.server';
import { ORDER_CONFIRMED_MESSAGE } from '@/lib/whatsapp-confirmation';
type Db=Parameters<typeof processJobs>[0];
function mockDb({paused=false,enabled=true,windowOpen=true,state='ok',kind='text',recent=[] as {body:string;created_at:string;status:string}[],text='Teste',previous=null as null|{wa_message_id:string;status:string},confirmation=false,requestStatus='accepted'}={}){
 const updates:Record<string,unknown>[]=[];let claims=0;
 const db={from:(table:string)=>{let mode='read';const q={select:()=>q,eq:()=>q,gte:()=>q,single:async()=>({data:table==='whatsapp_settings'?{business:defaultBusiness,account_state:state,auto_reply_enabled:enabled}:{automation_paused:paused,last_inbound_at:windowOpen?new Date().toISOString():new Date(Date.now()-25*3600000).toISOString()},error:null}),maybeSingle:async()=>({data:table==='whatsapp_order_requests'?{status:requestStatus,id:'request-1'}:previous,error:null}),update:(data:Record<string,unknown>)=>{updates.push(data);mode='update';return q;},then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({data:mode==='update'?null:table==='whatsapp_messages'?recent:[],error:null}).then(resolve)};return q;},rpc:async()=>({data:claims++===0?[{id:'job-1',phone:'5573999999999',kind,dedup_key:confirmation?'accepted:wa-request-1':'reply:wamid.in',payload:{text,inboundId:'wamid.in',automatic:!confirmation&&kind!=='receipt',...(confirmation?{orderId:'wa-request-1',pixPrompt:true}:{})}}]:[],error:null})};return {db:db as unknown as Db,updates,pause:()=>{paused=true;}};
}
describe('WhatsApp guarded job processing',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('processes attachments even when replies are disabled and the account is blocked',async()=>{const {db}=mockDb({enabled:false,state:'blocked',paused:true,kind:'receipt'});await processJobs(db,1);expect(processReceipt).toHaveBeenCalledWith(db,'wamid.in');expect(sendText).not.toHaveBeenCalled();});
 it('does not pause the robot after receipt storage fails',async()=>{const {db,updates}=mockDb({kind:'receipt'});vi.mocked(processReceipt).mockRejectedValueOnce(new Error('Storage unavailable'));await processJobs(db,1);expect(updates.some(u=>u['automation_paused']===true)).toBe(false);expect(updates.some(u=>u['state']==='failed')).toBe(true);});
 it('does not send after a human pauses the conversation',async()=>{const{db,updates}=mockDb({paused:true});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();expect(updates).toContainEqual({state:'cancelled'});});
 it('does not send automation when globally disabled',async()=>{const{db}=mockDb({enabled:false});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();});
 it('never sends free-form text outside the 24 hour window',async()=>{const{db,updates}=mockDb({windowOpen:false});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();expect(updates.some(u=>u['state']==='unknown')).toBe(true);});
 it('does not send when the account is blocked',async()=>{const{db}=mockDb({state:'blocked'});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();});
 it('bounds sends to the requested batch size',async()=>{const{db}=mockDb();vi.mocked(sendText).mockResolvedValue('wamid.test');await processJobs(db,1);expect(sendText).toHaveBeenCalledTimes(1);});
 it('does not repeat a response already sent by staff or automation',async()=>{const{db,updates}=mockDb({recent:[{body:'Teste',created_at:new Date().toISOString(),status:'sent'}]});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();expect(updates.some(u=>u['state']==='cancelled')).toBe(true);});
 it('recovers completed sends without sending again after a job replay',async()=>{const{db}=mockDb({previous:{wa_message_id:'wamid.sent',status:'accepted'}});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();});
 it('checks for an operator response again immediately before sending',async()=>{const{db,updates,pause}=mockDb();vi.mocked(sendTyping).mockImplementationOnce(async()=>{pause();});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();expect(updates.some(u=>u['state']==='cancelled')).toBe(true);});
 it('sends exactly once after the order is accepted, using the acceptance job even when intake is paused',async()=>{const{db}=mockDb({confirmation:true,paused:true,text:'Legacy message'});vi.mocked(sendText).mockResolvedValue('wamid.confirmed');await processJobs(db,2);expect(sendText).toHaveBeenCalledTimes(1);expect(sendText).toHaveBeenCalledWith(db,'5573999999999',ORDER_CONFIRMED_MESSAGE,{source:'pdv',replyTo:'job-1',orderId:'wa-request-1'});});
 it.each(['awaiting_acceptance','rejected','cancelled'])('does not announce confirmation for %s orders',async requestStatus=>{const{db,updates}=mockDb({confirmation:true,requestStatus});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();expect(updates.some(u=>u['state']==='cancelled')).toBe(true);});
 it('does not repeat the confirmation if its accepted send was already persisted',async()=>{const{db}=mockDb({confirmation:true,previous:{wa_message_id:'wamid.confirmed',status:'accepted'}});await processJobs(db,1);expect(sendText).not.toHaveBeenCalled();});
});