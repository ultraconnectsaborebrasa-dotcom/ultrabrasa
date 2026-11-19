import { describe, expect, it } from 'vitest';
import { suggestWhatsAppManualOrder } from '@/lib/whatsapp-manual-order';

const inbound = (body: string) => ({ direction: 'in', kind: 'text', body });

 describe('montagem manual a partir da conversa do WhatsApp', () => {
  it('preenche nome, rua, número, bairro, referência e pagamento para revisão', () => {
    const order = suggestWhatsAppManualOrder('5573999990000', 'Perfil', [
      inbound('Meu nome é Núbia Dantas Ramos'),
      inbound('Rua do Oeste, 30, bairro Centro'),
      inbound('Referência: quase em frente à Praça Dr. Gusmão'),
      inbound('Vou pagar no Pix'),
    ]);

    expect(order).toMatchObject({
      phone: '5573999990000',
      customer: 'Núbia Dantas Ramos',
      type: 'Delivery',
      paymentLabel: 'Pix',
      delivery: {
        paymentMethod: 'Pix',
        address: {
          street: 'Rua do Oeste',
          number: '30',
          neighborhood: 'Centro',
          reference: 'quase em frente à Praça Dr. Gusmão',
        },
      },
    });
  });

  it('usa a correção mais recente e ignora mensagens da loja', () => {
    const order = suggestWhatsAppManualOrder('5573999990000', null, [
      inbound('Me chamo Ana Souza'),
      inbound('Rua A, 10, bairro Centro'),
      { direction: 'out', kind: 'text', body: 'Rua Errada, 999, bairro Errado' },
      inbound('Corrige: Rua B, 25, bairro Pequi'),
    ]);

    expect(order.customer).toBe('Ana Souza');
    expect(order.delivery?.address).toMatchObject({ street: 'Rua B', number: '25', neighborhood: 'Pequi' });
  });

  it('usa o nome válido do perfil somente quando o cliente não informou um nome', () => {
    const order = suggestWhatsAppManualOrder('5573999990000', 'Maria Perfil', [inbound('Rua A, 10, bairro Centro')]);
    expect(order.customer).toBe('Maria Perfil');
  });

  it('não transforma uma resposta operacional em nome do cliente', () => {
    const order = suggestWhatsAppManualOrder('5573999990000', 'ok tbem', [inbound('Quero uma marmita')]);
    expect(order.customer).toBe('');
  });
});
