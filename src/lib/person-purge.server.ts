export async function finishCleanup(cleanupId: string) {
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const job = await db.from('person_purge_cleanup').select('*').eq('id', cleanupId).single();
  if (job.error) throw new Error('Não foi possível localizar a limpeza pendente.');
  if (job.data.storage_paths.length) {
    const removed = await db.storage.from('payment-receipts').remove(job.data.storage_paths);
    if (removed.error) return false;
  }
  for (const id of job.data.auth_ids) {
    const removed = await db.auth.admin.deleteUser(id);
    if (removed.error && removed.error.code !== 'user_not_found') return false;
  }
  const removed = await db.from('person_purge_cleanup').delete().eq('id', cleanupId);
  return !removed.error;
}