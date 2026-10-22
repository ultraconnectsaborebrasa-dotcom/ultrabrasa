import {describe,it,expect} from 'vitest';
import {mergeSnapshot} from '@/lib/pdv-sync';
import {getState,type State} from '@/lib/pdv-store';
describe('Sincronização de dispositivos',()=>{
 it('recebe pedido do celular na fila da cozinha e preserva o carrinho do computador',()=>{
 const current:State={...getState(),draft:{...getState().draft,customer:'Mesa 4'},orders:[]};
 const remote={...current,orders:[{id:'mobile-1',number:12,type:'Mesa' as const,customer:'Mesa 2',items:[{uid:'1',productId:'p1',name:'Espeto',price:8,qty:2,note:''}],note:'',discount:0,fee:0,serviceFee:false,payments:[],status:'cozinha' as const,createdAt:1}]};
 const merged=mergeSnapshot(current,{data:remote,revision:6},5);
 expect(merged?.orders.filter(o=>o.status==='cozinha').map(o=>o.id)).toEqual(['mobile-1']);expect(merged?.orders[0]?.items[0]?.qty).toBe(2);expect(merged?.draft.customer).toBe('Mesa 4');
 });
 it('não aplica evento antigo nem duplicado',()=>{expect(mergeSnapshot(getState(),{data:getState(),revision:4},5)).toBeNull();expect(mergeSnapshot(getState(),{data:getState(),revision:5},5)).toBeNull();});
 it('rejeita snapshot incompleto sem apagar o PDV',()=>{expect(mergeSnapshot(getState(),{data:{orders:[]},revision:6},5)).toBeNull();});
});
