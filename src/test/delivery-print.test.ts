import { describe,it,expect } from 'vitest';
import { formatDeliveryTicket, formatRouteSheet } from '../services/thermalPrinter';
import { emptyDelivery, type Delivery } from '../lib/delivery';
const delivery=(patch:Partial<Delivery>={}):Delivery=>({id:'1',order_id:'o1',number:7,customer:'Maria',phone:'5573999998888',address:{...emptyDelivery().address,street:'Rua das Palmeiras',number:'123',neighborhood:'Centro',reference:'Portao azul'},created_at:'2026-10-25T12:00:00Z',delivered_at:null,status:'Pronto para entrega',route_id:null,position:0,courier_id:null,total:45,due:45,payment_method:'Dinheiro',change:50,problem:null,items:[{name:'Espeto de carne com legumes',qty:2,note:'Sem cebola'}],...patch});
describe('delivery print ticket',()=>{
 it('prints full delivery address with reference',()=>{const t=formatDeliveryTicket(delivery());expect(t).toContain('Rua das Palmeiras');expect(t).toContain('Centro');expect(t).toContain('REF: Portao azul');expect(t).toContain('ENTREGAR EM:');});
 it('never exceeds the 58mm line width',()=>{for(const l of formatDeliveryTicket(delivery()).split('\n'))expect(l.length).toBeLessThanOrEqual(28);});
 it('shows payment, amount to collect and change',()=>{const t=formatDeliveryTicket(delivery());expect(t).toContain('Dinheiro');expect(t).toContain('A RECEBER:');expect(t).toContain('TROCO PARA:');});
});
