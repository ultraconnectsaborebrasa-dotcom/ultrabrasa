import type { Settings } from './pdv-store';

export function validateSettings(s: Settings): string | null {
  if (!s.storeName.trim()) return 'Informe o nome da loja.';
  if (!s.categories.length || !s.paymentMethods.length || [...s.categories, ...s.paymentMethods].some(v => !v.trim())) return 'Mantenha ao menos uma categoria e uma forma de pagamento, sem nomes vazios.';
  if ([s.serviceFeePct, s.maxDiscountPct].some(v => !Number.isFinite(v) || v < 0 || v > 100)) return 'As porcentagens devem ficar entre 0 e 100.';
  if ([s.deliveryFee, s.dailyGoal].some(v => !Number.isFinite(v) || v < 0)) return 'Valores em reais não podem ser negativos.';
  const warning = s.kitchenWarningMinutes ?? 10;
  const late = s.kitchenLateMinutes ?? 20;
  if (!Number.isFinite(warning) || !Number.isFinite(late) || warning < 1 || late <= warning) return 'O atraso da cozinha deve ser maior que o primeiro alerta.';
  if (new Set(s.categories).size !== s.categories.length || new Set(s.paymentMethods).size !== s.paymentMethods.length) return 'Remova os nomes repetidos nas listas.';
  return null;
}

export function kitchenTone(minutes: number, s: Settings) {
  return minutes > (s.kitchenLateMinutes ?? 20) ? 'border-destructive' : minutes > (s.kitchenWarningMinutes ?? 10) ? 'border-warning' : 'border-border';
}