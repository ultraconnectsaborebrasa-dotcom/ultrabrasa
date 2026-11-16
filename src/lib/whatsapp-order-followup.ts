import { windowStart } from './whatsapp-rulebot';

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const greeting = /^(?:oi+|ola|bom dia|boa tarde|boa noite|opa|e ai|eai)(?: tudo bem)?[!. ]*$/;

/** Só uma intenção clara de compra reabre uma conversa pausada por pedido confirmado. */
export function hasExplicitNewOrderIntent(text: string): boolean {
  const n = normalize(text);
  const item = String.raw`(?:pedido|marmit\w*|quentinh\w*)`;
  const intent = String.raw`(?:quero|queria|gostaria|vou|pode|poderia|fazer|faz|pedir|manda|mandar)`;
  return new RegExp(`\\b${intent}\\b[^\\n]{0,60}\\b(?:nov[oa]|outr[oa]|mais)\\b[^\\n]{0,40}\\b${item}\\b`).test(n)
    || new RegExp(`\\b(?:quero|queria|gostaria|vou)\\s+(?:fazer\\s+)?(?:um\\s+|uma\\s+)?pedido\\b`).test(n)
    || new RegExp(`\\b(?:quero|queria|gostaria|vou|manda|mandar)\\s+(?:mais\\s+)?(?:\\d{1,2}|um|uma)?\\s*(?:marmit\\w*|quentinh\\w*)\\b`).test(n)
    || /^(?:novo pedido|outro pedido|mais uma marmita)[!. ]*$/.test(n);
}

/**
 * Mensagens sobre o pedido anterior ficam com a equipe. Uma nova compra explícita
 * ou uma saudação/interesse em outro período de atendimento começa um novo fluxo.
 */
export function shouldResumeAfterConfirmedOrder(text: string, confirmedAt: string, now = new Date()): boolean {
  if (hasExplicitNewOrderIntent(text)) return true;
  const confirmed = Date.parse(confirmedAt);
  if (!Number.isFinite(confirmed) || confirmed >= Date.parse(windowStart(now))) return false;
  const n = normalize(text);
  return greeting.test(n) || /\b(?:cardapio|o que tem|marmit\w*|quentinh\w*)\b/.test(n);
}
