import { describe, it, expect } from 'vitest';
import { businessSchema, closedMessage } from './whatsapp-business';
const hours=[0,1,2,3,4,5,6].map(day=>({day,lunchEnd:day===3?'':'14:00',nightStart:'',nightEnd:''}));
// 2026-11-03 é terça; 22:00 em São Paulo = 01:00Z do dia 4
const tueNight=new Date('2026-11-04T01:00:00Z');
describe('mensagem de loja fechada',()=>{
  it('diz amanhã só quando abre amanhã',()=>{
    const b=businessSchema.parse({hours:hours.map(h=>({...h,lunchEnd:'14:00'}))});
    expect(closedMessage(b,tueNight)).toContain('amanhã, a partir das 10:00');
  });
  it('informa o dia certo quando não abre amanhã',()=>{
    const m=closedMessage(businessSchema.parse({hours}),tueNight);
    expect(m).not.toContain('amanhã');expect(m).toContain('na quinta-feira');
  });
  it('não oferece pedido antecipado se desligado',()=>{
    const m=closedMessage(businessSchema.parse({hours,acceptAdvanceOrders:false}),tueNight);
    expect(m).not.toContain('pedido');
  });
  it('não usa expressões frias',()=>{
    expect(closedMessage(businessSchema.parse({hours}),tueNight)).not.toMatch(/expediente|avaliação da loja|próximo atendimento/i);
  });
});
