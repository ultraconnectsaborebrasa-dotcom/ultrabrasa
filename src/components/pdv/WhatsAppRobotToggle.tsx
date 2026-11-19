import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, Bot, PackageX, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { whatsappSetAutoReply, whatsappSetStockExhausted } from '@/lib/whatsapp-robot-toggle.functions';

type RobotMode = { enabled: boolean; stockExhausted: boolean; circuitPaused: boolean };
type Props = RobotMode & { circuitReason: string; onChange: (mode: RobotMode) => void };

export function WhatsAppRobotToggle({ enabled, stockExhausted, circuitPaused, circuitReason, onChange }: Props) {
  const [busy, setBusy] = useState<'robot' | 'stock' | null>(null);
  const setAutoReply = useServerFn(whatsappSetAutoReply);
  const setStockExhausted = useServerFn(whatsappSetStockExhausted);
  const normalFlow = enabled && !stockExhausted && !circuitPaused;

  async function toggleRobot() {
    const next = !normalFlow;
    setBusy('robot');
    try {
      const result = await setAutoReply({ data: { enabled: next } });
      onChange({ enabled: result.enabled, stockExhausted: false, circuitPaused: false });
      toast.success(next ? 'Robô ativado' : 'Robô desativado', {
        description: next
          ? circuitPaused
            ? 'O bloqueio técnico foi limpo. Novas mensagens serão processadas; conclua a configuração indicada no aviso.'
            : 'O atendimento automático normal foi restaurado. Conversas assumidas pela equipe continuam manuais.'
          : 'Novas respostas automáticas e as que estavam na fila foram interrompidas.',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o robô');
    } finally {
      setBusy(null);
    }
  }

  async function toggleStockExhausted() {
    const next = !stockExhausted;
    setBusy('stock');
    try {
      const result = await setStockExhausted({ data: { enabled: next } });
      onChange({ enabled: next ? true : enabled, stockExhausted: result.stockExhausted, circuitPaused });
      toast.success(next ? 'Aviso de estoque esgotado ativado' : 'Atendimento normal restaurado', {
        description: next
          ? 'Quem falar com a loja receberá o aviso de encerramento, sem mensagem em massa.'
          : 'O roteiro automático de pedidos voltou a funcionar.',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o aviso de estoque');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2">
        <span className={cn('inline-flex items-center gap-1.5 px-1 text-xs font-semibold', normalFlow ? 'text-success' : stockExhausted || circuitPaused ? 'text-warning' : 'text-muted-foreground')}>
          {stockExhausted ? <PackageX size={16} /> : circuitPaused ? <AlertTriangle size={16} /> : <Bot size={16} />}
          {stockExhausted ? 'Estoque esgotado' : circuitPaused ? 'Envio bloqueado' : `Robô ${enabled ? 'ligado' : 'desligado'}`}
        </span>
        <Button
          type="button"
          size="sm"
          variant={normalFlow ? 'outline' : 'default'}
          aria-pressed={normalFlow}
          aria-label={normalFlow ? 'Desativar robô do WhatsApp' : 'Ativar robô do WhatsApp'}
          disabled={busy !== null}
          onClick={() => void toggleRobot()}
        >
          <Power /> {busy === 'robot' ? 'Salvando…' : normalFlow ? 'Desativar robô' : 'Ativar robô'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={stockExhausted ? 'default' : 'outline'}
          aria-pressed={stockExhausted}
          aria-label={stockExhausted ? 'Encerrar aviso de estoque esgotado' : 'Ativar aviso de estoque esgotado'}
          disabled={busy !== null}
          onClick={() => void toggleStockExhausted()}
        >
          <PackageX /> {busy === 'stock' ? 'Salvando…' : stockExhausted ? 'Encerrar aviso' : 'Estoque esgotado'}
        </Button>
      </div>
      {circuitPaused && <p role="alert" className="max-w-md rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning">{circuitReason || 'O WhatsApp bloqueou os envios. Resolva a configuração da conta e ative o robô novamente.'}</p>}
    </div>
  );
}
