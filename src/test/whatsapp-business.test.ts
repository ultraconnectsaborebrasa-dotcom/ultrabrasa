import { describe,it,expect } from 'vitest';
import {defaultBusiness,businessPeriod,inEunapolis,conversationDraftSchema,missingOrderFields} from '@/lib/whatsapp-business';
describe('WhatsApp business rules',()=>{
  it('uses the specified marmita price',()=>expect(defaultBusiness.lunchPrice).toBe(19.90));
  it('keeps the specified ingredients',()=>expect(defaultBusiness.lunchMenu).toBe('churrasco de carne assada, linguiça de frango, arroz, salada, macarrão e farofa de feijão'));
  it('enables free delivery inside Eunapolis',()=>expect(defaultBusiness.freeDelivery&&inEunapolis('Eunápolis')).toBe(true));
  it('does not treat outside cities as the promotion area',()=>expect(inEunapolis('Porto Seguro')).toBe(false));
  it('starts advance orders at 10h',()=>expect(defaultBusiness.advanceFrom).toBe('10:00'));
  it('starts departure at 11h',()=>expect(defaultBusiness.departureFrom).toBe('11:00'));
  it('does not invent missing business hours',()=>expect(businessPeriod(defaultBusiness)).toBe('closed'));
  it('requires an explicit cash change response',()=>expect(missingOrderFields(conversationDraftSchema.parse({payment:'Dinheiro'}))).toContain('troco (ou sem troco)'));
  it('does not re-request a supplied name',()=>expect(missingOrderFields(conversationDraftSchema.parse({customer:'Ana'}))).not.toContain('nome'));
  it('opens for advance orders at 10 local time',()=>expect(businessPeriod({...defaultBusiness,hours:[{day:2,lunchEnd:'14:00',nightStart:'18:00',nightEnd:'23:00'}]},new Date('2026-11-03T13:00:00Z'))).toBe('lunch'));
  it('is closed before 10 local time',()=>expect(businessPeriod({...defaultBusiness,hours:[{day:2,lunchEnd:'14:00',nightStart:'18:00',nightEnd:'23:00'}]},new Date('2026-11-03T12:59:00Z'))).toBe('closed'));
});import { followUpMessage as fu, initialLunchMessage as ilm, defaultBusiness as db0 } from '@/lib/whatsapp-business';
describe('marmita natural',()=>{
  it('asks only house number',()=>expect(fu(['número'])).toBe('Certo! Me passa só o número da casa.'));
  it('asks payment',()=>expect(fu(['forma de pagamento','nome'])).toBe('Vai pagar no Pix, cartão ou dinheiro?'));
  it('adds early line before 11h',()=>expect(ilm(db0,new Date('2026-11-03T13:00:00Z'),19.9)).toContain('Já pode deixar seu pedido adiantado'));
  it('no early line after 11h',()=>expect(ilm(db0,new Date('2026-11-03T15:00:00Z'),19.9)).not.toContain('começam a sair'));
  it('uses PDV price',()=>expect(ilm(db0,new Date(),21)).toContain('21,00'));
});
import { menuOutsideNightMessage as mom } from '@/lib/whatsapp-business';
describe('menu request outside night',()=>{
  const b={...defaultBusiness,hours:[{day:2,lunchEnd:'14:00',nightStart:'18:00',nightEnd:'23:00'},{day:3,lunchEnd:'14:00',nightStart:'18:00',nightEnd:'23:00'}]};
  const base={price:19.9,available:true,menuUrl:'https://ultraconnectbrasa.com.br/cardapio',pdfOffer:true};
  const morning=new Date('2026-11-03T12:00:00Z'); // 09:00 Tue, before 11h
  const afternoon=new Date('2026-11-03T18:00:00Z'); // 15:00 Tue, after lunchEnd 14:00
  it('says what comes in the marmita',()=>expect(mom(b,{...base,now:morning})).toContain('Nossa marmita vem com churrasco de carne assada, linguiça de frango, arroz, salada, macarrão e farofa de feijão.'));
  it('gives the current price and the free delivery promise',()=>{const t=mom(b,{...base,now:morning});expect(t).toContain('19,90');expect(t).toContain('entrega grátis pra qualquer bairro de Eunápolis');});
  it('never adds the digital menu link or PDF to marmita',()=>{const t=mom(b,{...base,now:afternoon});expect(t).not.toContain('https://');expect(t).not.toContain('PDF');});
  it('drops the PDF line when no PDF is registered',()=>expect(mom(b,{...base,pdfOffer:false,now:afternoon})).not.toContain('PDF'));
  it('uses today departure time before 11h',()=>expect(mom(b,{...base,now:morning})).toContain('As entregas de hoje começam a sair às 11h.'));
  it('points to the next lunch after today is over',()=>{const t=mom(b,{...base,now:afternoon});expect(t).toContain('A próxima leva sai amanhã, a partir das 10:00.');expect(t).not.toContain('começam a sair');});
  it('says politely when marmitas are gone',()=>expect(mom(b,{...base,available:false,now:morning})).toBe('Nossas marmitas de hoje já acabaram, mas a próxima leva sai amanhã, a partir das 10:00.'));
});
import { isMenuAsk, isPriceAsk, lunchPriceMessage, closedMenuMessage } from '@/lib/whatsapp-business';
describe('cardápio e preço por período',()=>{
  const b={...defaultBusiness,hours:[{day:2,lunchEnd:'14:00',nightStart:'18:00',nightEnd:'23:00'},{day:3,lunchEnd:'14:00',nightStart:'18:00',nightEnd:'23:00'}]};
  const url='https://ultraconnectbrasa.com.br/cardapio';
  it('detecta "Cardápio" como pedido de cardápio',()=>expect(isMenuAsk('Cardápio')).toBe(true));
  it('detecta "Qual a faixa de preço do seu cardápio?"',()=>{const t='Qual a faixa de preço do seu cardápio?';expect(isPriceAsk(t)).toBe(true);expect(isMenuAsk(t)).toBe(true);});
  it('às 04:26 com almoço no dia: apresenta a marmita e a abertura, sem listar a loja',()=>{
    const t=closedMenuMessage(b,{price:19.9,menuUrl:url,pdfOffer:true,now:new Date('2026-11-03T07:26:00Z')});
    expect(t).toContain('Bom dia!');expect(t).toContain('Hoje começamos às 10:00');
    expect(t).toContain('R$\u00a019,90');expect(t).toContain('carne assada');
    expect(t).toContain('pedido adiantado');expect(t).not.toContain(url);
  });
  it('às 04:26 sem pedido antecipado: não oferece adiantamento',()=>{
    const t=closedMenuMessage({...b,acceptAdvanceOrders:false},{price:19.9,menuUrl:url,pdfOffer:true,now:new Date('2026-11-03T07:26:00Z')});
    expect(t).not.toContain('adiantado');
  });
  it('fechado com próxima abertura à noite: sem link nem lista de produtos',()=>{
    const t=closedMenuMessage({...b,hours:[{day:2,lunchEnd:'',nightStart:'18:00',nightEnd:'23:00'}]},{price:19.9,menuUrl:url,pdfOffer:true,now:new Date('2026-11-03T07:26:00Z')});
    expect(t).not.toContain(url);expect(t).toContain('hoje às 18:00');expect(t).not.toContain('marmita é');
  });
  it('preço no almoço: só a marmita, com entrega grátis',()=>{
    expect(lunchPriceMessage(19.9,true)).toBe('A marmita completa sai por R$\u00a019,90! E a entrega está grátis pra qualquer bairro de Eunápolis.');
  });
});
