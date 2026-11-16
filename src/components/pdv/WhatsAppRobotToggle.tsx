import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Bot, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { whatsappSetAutoReply } from '@/lib/whatsapp-robot-toggle.functions';

export function WhatsAppRobotToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const setAutoReply = useServerFn(whatsappSetAutoReply);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    try {
      const result = await setAutoReply({ data: { enabled: next } });
      onChange(result.enabled);
      toast.success(next ? 'Robô ativado' : 'Robô desativado', {
        description: next
          ? 'As conversas assumidas pela equipe continuam no atendimento manual.'
          : 'Novas respostas automáticas e as que estavam na fila foram interrompidas.',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o robô');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2">
      <span className={cn('inline-flex items-center gap-1.5 px-1 text-xs font-semibold', enabled ? 'text-success' : 'text-muted-foreground')}>
        <Bot size={16} /> Robô {enabled ? 'ligado' : 'desligado'}
      </span>
      <Button
        type="button"
        size="sm"
        variant={enabled ? 'outline' : 'default'}
        aria-pressed={enabled}
        aria-label={enabled ? 'Desativar robô do WhatsApp' : 'Ativar robô do WhatsApp'}
        disabled={busy}
        onClick={() => void toggle()}
      >
        <Power /> {busy ? 'Salvando…' : enabled ? 'Desativar robô' : 'Ativar robô'}
      </Button>
    </div>
  );
}
