import { brl } from '@/lib/pdv-store';
import { moneyInput } from '@/lib/order-adjustments';

export function OrderAdjustmentFields({ discount, extra, onDiscount, onExtra, subtotal, disabled = false }: {
  discount: string; extra: string; onDiscount: (value: string) => void; onExtra: (value: string) => void; subtotal: number; disabled?: boolean;
}) {
  const invalid = !Number.isFinite(moneyInput(discount)) || !Number.isFinite(moneyInput(extra)) || moneyInput(discount) < 0 || moneyInput(extra) < 0 || moneyInput(discount) > subtotal;
  return <div className="space-y-2 border-y py-3">
    <div className="grid grid-cols-2 gap-3">
      <label className="min-w-0 text-sm font-medium">Desconto (R$)<input aria-label="Desconto em reais" className="field mt-1 w-full" inputMode="decimal" placeholder="0,00" disabled={disabled} value={discount} onChange={event => onDiscount(event.target.value)} /></label>
      <label className="min-w-0 text-sm font-medium">Acréscimo (R$)<input aria-label="Acréscimo em reais" className="field mt-1 w-full" inputMode="decimal" placeholder="0,00" disabled={disabled} value={extra} onChange={event => onExtra(event.target.value)} /></label>
    </div>
    {invalid && <p role="alert" className="text-sm text-destructive">Use valores positivos; desconto máximo de {brl(subtotal)}.</p>}
  </div>;
}