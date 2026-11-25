import { useEffect, useState } from 'react';
import { Eye, EyeOff, Pencil, Trash2, Truck, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { directoryCouriers, type Courier } from '@/lib/delivery';
import { DeletePersonDialog } from './DeletePersonDialog';

type CourierForm = { id: string | null; name: string; phone: string; user: string };
type PendingAction = { courier: Courier; action: 'deactivate' | 'delete' };

export function CourierManager({ couriers, onChanged, admin=false }: { couriers: Courier[]; onChanged: () => Promise<unknown>; admin?: boolean }) {
  const [deleting,setDeleting]=useState<Courier|null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<CourierForm | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const visible = directoryCouriers(couriers, showInactive);
  const inactiveCount = couriers.filter(courier => !courier.deleted_at && !courier.active).length;

  useEffect(() => {
    void supabase.rpc('list_delivery_courier_accounts').then(({ data, error }) => {
      if (!error) setAccounts(data ?? []);
    });
  }, []);

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    setBusy(true);
    try {
      const result = await action();
      if (result.error) throw new Error(result.error.message);
      toast.success(success);
      await onChanged();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!form?.name.trim()) return;
    const saved = await run(() => supabase.rpc('save_delivery_courier', {
      ...(form.id ? { courier_id: form.id } : {}),
      courier_name: form.name,
      courier_phone: form.phone,
      ...(form.user ? { account_id: form.user } : {}),
    }), 'Entregador salvo.');
    if (saved) setForm(null);
  }

  async function changeState(courier: Courier, action: 'deactivate' | 'activate' | 'delete') {
    const messages = { deactivate: 'Entregador desativado e removido das novas designações.', activate: 'Entregador reativado.', delete: 'Entregador excluído da equipe; o histórico foi preservado.' };
    const saved = await run(() => supabase.rpc('set_delivery_courier_state', { p_courier_id: courier.id, p_action: action }), messages[action]);
    if (saved) setPending(null);
  }

  return <section className="space-y-4" aria-label="Cadastro de entregadores">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button disabled={busy} onClick={() => setForm({ id: null, name: '', phone: '', user: '' })}><Truck size={16} />Novo entregador</Button>
      {inactiveCount > 0 && <Button variant="outline" size="sm" aria-pressed={showInactive} onClick={() => setShowInactive(current => !current)}>{showInactive ? <EyeOff size={15} /> : <Eye size={15} />}{showInactive ? 'Ocultar desativados' : `Mostrar desativados · ${inactiveCount}`}</Button>}
    </div>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map(courier => <article className="rounded-lg border bg-card p-4" key={courier.id}>
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{courier.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${courier.active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{courier.active ? 'Ativo' : 'Desativado'}</span></div>
      <p className="mt-1 text-sm text-muted-foreground">{courier.phone || 'Sem telefone'} · {courier.user_id ? 'Conta vinculada' : 'Sem conta vinculada'}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy} aria-label={`Editar entregador ${courier.name}`} onClick={() => setForm({ id: courier.id, name: courier.name, phone: courier.phone, user: courier.user_id ?? '' })}><Pencil size={14} />Editar</Button>
        {courier.active
          ? <Button variant="outline" size="sm" disabled={busy} aria-label={`Desativar entregador ${courier.name}`} onClick={() => setPending({ courier, action: 'deactivate' })}><UserX size={14} />Desativar</Button>
          : <Button variant="outline" size="sm" disabled={busy} aria-label={`Reativar entregador ${courier.name}`} onClick={() => void changeState(courier, 'activate')}><UserCheck size={14} />Reativar</Button>}
        <Button variant="destructive" size="sm" disabled={busy} aria-label={`Excluir entregador ${courier.name}`} onClick={() => setPending({ courier, action: 'delete' })}><Trash2 size={14} />Excluir</Button>
        {admin&&<Button variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={()=>setDeleting(courier)}><Trash2 size={14}/>Excluir com histórico</Button>}
      </div>
    </article>)}</div>
    {!visible.length && <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">Nenhum entregador ativo no momento.</p>}

    {deleting&&<DeletePersonDialog kind="courier" id={deleting.id} name={deleting.name} onClose={()=>setDeleting(null)} onDeleted={()=>void onChanged()}/>}
    {form && <div role="dialog" aria-modal="true" aria-label="Cadastro de entregador" className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-5 shadow-lg"><h2 className="text-xl font-bold">Entregador</h2>
        <label className="block text-sm">Nome<input aria-label="Nome do entregador" className="field mt-1" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label className="block text-sm">Telefone<input aria-label="Telefone do entregador" type="tel" className="field mt-1" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label>
        <label className="block text-sm">Conta de acesso<select aria-label="Conta de acesso do entregador" className="field mt-1" value={form.user} onChange={event => setForm({ ...form, user: event.target.value })}><option value="">Sem conta vinculada</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setForm(null)}>Cancelar</Button><Button disabled={busy || !form.name.trim()} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar'}</Button></div>
      </div>
    </div>}

    <AlertDialog open={pending !== null} onOpenChange={open => { if (!open && !busy) setPending(null); }}>
      <AlertDialogContent><AlertDialogHeader>
        <AlertDialogTitle>{pending?.action === 'delete' ? 'Excluir entregador?' : 'Desativar entregador?'}</AlertDialogTitle>
        <AlertDialogDescription>{pending?.action === 'delete'
          ? `${pending.courier.name} deixará de aparecer na equipe e não poderá receber novas entregas. Nome, entregas, turnos, cargas e relatórios antigos serão preservados. A conta de login não será apagada.`
          : `${pending?.courier.name ?? ''} deixará de aparecer nas novas designações, mas continuará no cadastro como desativado e poderá ser reativado. Entregas, turno e carga precisam estar encerrados.`}</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
        <Button variant="destructive" disabled={busy} onClick={() => { if (pending) void changeState(pending.courier, pending.action); }}>{pending?.action === 'delete' ? <Trash2 size={16} /> : <UserX size={16} />}{busy ? 'Salvando…' : pending?.action === 'delete' ? 'Confirmar exclusão' : 'Confirmar desativação'}</Button>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
}
