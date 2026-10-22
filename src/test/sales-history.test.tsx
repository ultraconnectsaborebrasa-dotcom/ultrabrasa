import {describe,it,expect} from 'vitest';
import {filterSales,summarizeSales} from '@/lib/sales-history';
import {type Order} from '@/lib/pdv-store';
const sale=(patch:Partial<Order>={}):Order=>({id:'sale-1',number:1,type:'Balcão',customer:'Ana',items:[{uid:'item-1',productId:'p1',name:'Espeto',price:8,qty:3,note:''}],note:'',discount:0,fee:0,serviceFee:false,payments:[{method:'Pix',amount:24}],status:'pago',createdAt:new Date('2026-10-21T23:50:00').getTime(),paidAt:new Date('2026-10-22T00:10:00').getTime(),...patch});
describe('Histórico de vendas',()=>{
 it('usa a data do pagamento para uma venda que passou da meia-noite',()=>{expect(filterSales([sale()],'2026-10-22','2026-10-22')).toHaveLength(1);expect(filterSales([sale()],'2026-10-21','2026-10-21')).toHaveLength(0);});
 it('inclui o último minuto da data final mas não o dia seguinte',()=>{const last=sale({paidAt:new Date('2026-10-22T23:59:59').getTime()});const next=sale({id:'next',paidAt:new Date('2026-10-23T00:00:00').getTime()});expect(filterSales([last,next],'2026-10-22','2026-10-22').map(o=>o.id)).toEqual(['sale-1']);});
 it('mostra cancelados mas não soma no faturamento e nas quantidades',()=>{const rows=filterSales([sale(),sale({id:'cancel',status:'cancelado'})],'','');expect(rows).toHaveLength(2);expect(summarizeSales(rows)).toMatchObject({count:1,revenue:24,units:3,ticket:24});});
 it('agrega quantidades pelo produto mesmo com mudança de nome',()=>{const renamed=sale({id:'second',items:[{uid:'2',productId:'p1',name:'Espeto de carne',price:9,qty:2,note:''}],payments:[{method:'Dinheiro',amount:18}]});expect(summarizeSales([sale(),renamed]).products).toEqual([{id:'p1',name:'Espeto',qty:5,amount:42}]);});
 it('mantém produtos distintos com o mesmo nome separados',()=>{const other=sale({items:[{uid:'2',productId:'p2',name:'Espeto',price:8,qty:1,note:''}]});expect(summarizeSales([sale(),other]).products.map(p=>p.qty)).toEqual([3,1]);});
 it('retorna vazio em intervalo invertido ou inválido',()=>{expect(filterSales([sale()],'2026-10-23','2026-10-21')).toEqual([]);expect(filterSales([sale()],'invalid','')).toEqual([]);});
 it('histórico funciona independentemente da abertura do caixa',()=>{expect(summarizeSales([sale()]).revenue).toBe(24);expect(filterSales([sale()],'','')).toHaveLength(1);});
});
