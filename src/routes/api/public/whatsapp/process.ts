import {createFileRoute} from '@tanstack/react-router';
import {authenticateCronRequest} from '@/integrations/supabase/cron-auth';
import {runAfterResponse} from '@/lib/background';
export const Route=createFileRoute('/api/public/whatsapp/process')({server:{handlers:{POST:async({request})=>{
  const invalid=await authenticateCronRequest(request);if(invalid)return invalid;
  await runAfterResponse(request,'WhatsApp processing',async()=>{const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const {recoverPending}=await import('@/lib/whatsapp.server');const {processJobs}=await import('@/lib/whatsapp-automation.server');const {processCourierPush}=await import('@/lib/courier-push.server');await Promise.all([processCourierPush(), (async()=>{await recoverPending(supabaseAdmin,2);await processJobs(supabaseAdmin,8);})()]);});
  return Response.json({accepted:true},{status:202});
}}}});
