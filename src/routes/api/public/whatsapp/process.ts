import {createFileRoute} from '@tanstack/react-router';
import {authenticateCronRequest} from '@/integrations/supabase/cron-auth';
export const Route=createFileRoute('/api/public/whatsapp/process')({server:{handlers:{POST:async({request})=>{
  const invalid=await authenticateCronRequest(request);if(invalid)return invalid;
  const runtime=request as Request & {runtime?:{cloudflare?:{context?:{waitUntil:(task:Promise<unknown>)=>void}}}};
  const context=runtime.runtime?.cloudflare?.context;
  if(!context)return new Response('Background context unavailable',{status:503});
  const work=async()=>{const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const {recoverPending}=await import('@/lib/whatsapp.server');const {processJobs}=await import('@/lib/whatsapp-automation.server');await recoverPending(supabaseAdmin,2);await processJobs(supabaseAdmin,2);};
  context.waitUntil(work().catch(e=>console.error('WhatsApp processing failed',e)));
  return Response.json({accepted:true},{status:202});
}}}});