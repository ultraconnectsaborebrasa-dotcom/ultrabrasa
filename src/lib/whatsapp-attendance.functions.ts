import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import {businessSchema} from './whatsapp-business';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/integrations/supabase/types';
async function admin(context:{supabase:SupabaseClient<Database>;userId:string}){
  const r=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});if(r.error||!r.data)throw new Error('Somente o administrador');
}
export const whatsappAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({phone:z.string().regex(/^[1-9]\d{9,14}$/),action:z.enum(['take','resume','read','waiting','finish','note']),body:z.string().max(2000).optional()}).parse(input)).handler(async({data,context})=>{
  await admin(context);const r=await context.supabase.rpc('wa_conversation_action',{_phone:data.phone,_action:data.action,_body:data.body??''});if(r.error)throw new Error(r.error.message);return {ok:true};
});
export const whatsappRequestAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({id:z.string().uuid(),accept:z.boolean()}).parse(input)).handler(async({data,context})=>{
  await admin(context);if(data.accept){const r=await context.supabase.rpc('wa_accept_request',{_id:data.id});if(r.error)throw new Error(r.error.message);return r.data;}
  const r=await context.supabase.rpc('wa_reject_request',{_id:data.id});if(r.error)throw new Error(r.error.message);return null;
});
export const whatsappSaveBusiness=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({business:businessSchema,enabled:z.boolean(),quickReplies:z.array(z.string().min(1).max(1000)).max(20)}).parse(input)).handler(async({data,context})=>{
  await admin(context);if(data.enabled&&(!data.business.pixKey||data.business.hours.length!==7||data.business.hours.some(h=>!h.lunchEnd||!h.nightStart||!h.nightEnd)))throw new Error('Preencha a chave Pix e horários de todos os dias antes de ativar');
  if(data.business.hours.some(h=>h.lunchEnd&&h.lunchEnd<=data.business.advanceFrom))throw new Error('O almoço precisa terminar depois de abrir');
  const r=await context.supabase.from('whatsapp_settings').update({business:data.business,auto_reply_enabled:data.enabled,quick_replies:data.quickReplies,updated_at:new Date().toISOString()}).eq('id',1);if(r.error)throw new Error(r.error.message);return {ok:true};
});
export const whatsappSendPdf=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({phone:z.string().regex(/^[1-9]\d{9,14}$/)}).parse(input)).handler(async({data,context})=>{
  await admin(context);const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const {queueJob}=await import('./whatsapp-automation.server');
  const cfg=await context.supabase.from('whatsapp_settings').select('business').eq('id',1).single();if(cfg.error||!businessSchema.parse(cfg.data.business).pdfPath)throw new Error('Cadastre o PDF primeiro');
  await queueJob(supabaseAdmin,`manual-pdf:${crypto.randomUUID()}`,data.phone,'document',{automatic:false});return {queued:true};
});