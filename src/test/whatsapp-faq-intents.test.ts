import { describe, expect, it } from 'vitest';
import { isDeliveryTimeQuestion, isStoreLocationQuestion } from '@/lib/whatsapp-rulebot';
describe('perguntas de prazo e localização', () => {
  it.each(['qual prazo para entrega?', 'Quanto tempo para entregar?', 'demora muito?', 'em quanto tempo chega', 'que horas chega meu pedido'])('prazo: %s', t => expect(isDeliveryTimeQuestion(t)).toBe(true));
  it.each(['onde fica?', 'Onde é?', 'aonde é?', 'aonde fica ai', 'manda a localização', 'qual o endereço', 'onde é a loja'])('local: %s', t => expect(isStoreLocationQuestion(t)).toBe(true));
  it('endereço do cliente não é pergunta da loja', () => {
    expect(isStoreLocationQuestion('meu endereço é rua A 10')).toBe(false);
    expect(isDeliveryTimeQuestion('quero 2 marmitas')).toBe(false);
  });
});
