import { describe, expect, it } from 'vitest';
import { pixPaymentMessage, requestPaymentMethod } from '@/lib/whatsapp-payment';

describe('Pagamento Pix após a confirmação', () => {
  it('mantém o Pix salvo no endereço de entrega ao abrir a edição', () => {
    expect(requestPaymentMethod({ delivery: { paymentMethod: 'Pix' } })).toBe('Pix');
  });

  it('recupera o Pix do resumo confirmado quando uma edição antiga apagou os campos', () => {
    expect(requestPaymentMethod({ payment: '', delivery: { paymentMethod: '' }, note: 'Origem: BOT AUTOMÁTICO · Pagamento: Pix — aguardando pagamento' })).toBe('Pix');
  });

  it('não transforma cartão ou dinheiro em Pix', () => {
    expect(requestPaymentMethod({ delivery: { paymentMethod: 'Cartão' }, note: 'Pagamento: Cartão na entrega — a receber' })).toBe('Cartão');
    expect(requestPaymentMethod({ payment: 'Dinheiro', note: 'Pagamento: Dinheiro na entrega — a receber' })).toBe('Dinheiro');
  });

  it('usa exatamente a mensagem combinada e a chave Pix cadastrada', () => {
    expect(pixPaymentMessage('73982423404')).toBe('Para realizar o pagamento, segue nossa chave PIX:\n\nChave PIX telefone 73982423404\n\nApós o pagamento, se possível, envie o comprovante por aqui para confirmarmos. ✅\n\nAgradecemos pela preferência!\n\nUltraConnect🔥');
  });
});
