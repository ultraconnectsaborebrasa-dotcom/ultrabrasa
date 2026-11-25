import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { deletePersonPermanently, completePersonPurge } from '@/lib/person-purge.functions';

type Preview = { name: string; orders: number; deliveries: number; receipts: number; messages: number; blocked: boolean };
export function DeletePersonDialog({ kind, id, name, onClose, onDeleted }: { kind: 'customer' | 'courier' | 'staff'; id: string; name: string; onClose: () => void; onDeleted: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [cleanupId, setCleanupId] = useState<string | null>(null);
  const remove = useServerFn(deletePersonPermanently);
  const cleanup = useServerFn(completePersonPurge);
  useEffect(() => {
    let active = true;
    void supabase.rpc('purge_person_history', { p_kind: kind, p_id: id }).then(({ data, error: issue }) => {
      if (!active) return;
      if (issue) setError(issue.message); else setPreview(data as unknown as Preview);
    });
    return () => { active = false; };
  }, [kind, id]);
  async function confirm() {
    if (busy || (!cleanupId && (confirmation !== 'EXCLUIR' || !preview || preview.blocked))) return;
    setBusy(true);setError('');
    try {
      const result = cleanupId ? await cleanup({ data: { cleanupId } }) : await remove({ data: { kind, id, confirmation: 'EXCLUIR' } });
      if ('cleanupId' in result && typeof result.cleanupId === 'string') setCleanupId(result.cleanupId);
      if (!result.completed) { setError('O cadastro e o histórico foram removidos; falta concluir a limpeza dos arquivos ou da conta. Tente concluir novamente.'); return; }
      toast.success('Cadastro, acesso e histórico vinculado excluídos definitivamente.');onDeleted();onClose();
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Não foi possível excluir.'); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy && !cleanupId) onClose(); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Excluir cadastro e histórico?</DialogTitle><DialogDescription><b>{name}</b> será removido definitivamente. Os pedidos vinculados também sairão dos relatórios de vendas. Não há desfazer.</DialogDescription></DialogHeader>
    {!preview && !error && <p role="status">Conferindo registros vinculados…</p>}
    {preview && <dl className="grid grid-cols-2 gap-3 border-y py-3 text-sm"><div><dt>Pedidos</dt><dd className="font-bold">{preview.orders}</dd></div><div><dt>Entregas</dt><dd className="font-bold">{preview.deliveries}</dd></div><div><dt>Comprovantes</dt><dd className="font-bold">{preview.receipts}</dd></div><div><dt>Mensagens vinculadas</dt><dd className="font-bold">{preview.messages}</dd></div></dl>}
    {preview?.blocked && <p role="alert" className="text-sm text-warning">Encerre pedidos, entregas, ponto e cargas em andamento antes de excluir.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!cleanupId && <label className="text-sm font-semibold">Digite EXCLUIR para confirmar<input aria-label="Confirmação de exclusão definitiva" className="field mt-1 w-full" autoComplete="off" disabled={busy || !preview || preview.blocked} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy || Boolean(cleanupId)} onClick={onClose}>Cancelar</Button><Button variant="destructive" disabled={busy || (!cleanupId && (!preview || preview.blocked || confirmation !== 'EXCLUIR'))} onClick={() => void confirm()}>{busy ? 'Excluindo…' : cleanupId ? 'Concluir limpeza pendente' : 'Excluir definitivamente'}</Button></div>
  </DialogContent></Dialog>;
}