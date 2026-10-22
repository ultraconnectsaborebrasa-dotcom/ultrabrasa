import { describe, expect, it, afterEach } from 'vitest';
import { TABLES, validTable, tableLabel, tableOrders } from '@/lib/pdv-tables';
import { getState, replaceState, updateDraft, addToDraft, commitDraft } from '@/lib/pdv-store';
const original=structuredClone(getState());
afterEach(()=>replaceState(structuredClone(original)));
describe('Cinco mesas e cozinha',()=>{
  it('oferece exatamente as mesas 1 a 5',()=>{expect(TABLES).toEqual([1,2,3,4,5]);expect(validTable(6)).toBe(false);expect(validTable(0)).toBe(false);});
  it('não envia pedido de mesa sem uma mesa válida',()=>{const product=getState().products[0];if(!product)throw new Error('Produto ausente');addToDraft(product);updateDraft({type:'Mesa'});expect(commitDraft('cozinha')).toBeNull();expect(getState().orders).toHaveLength(0);});
  it('leva mesa, quantidade e especificação para a cozinha',()=>{const product=getState().products[0];if(!product)throw new Error('Produto ausente');addToDraft(product);updateDraft({type:'Mesa',tableNumber:5,note:'Servir juntos',items:getState().draft.items.map(i=>({...i,qty:2,note:'Ao ponto'}))});const order=commitDraft('cozinha');expect(order?.tableNumber).toBe(5);expect(order?.items[0]?.qty).toBe(2);expect(order?.items[0]?.note).toBe('Ao ponto');expect(order?.status).toBe('cozinha');expect(tableLabel(order??{type:'',customer:''})).toBe('Mesa 5');expect(tableOrders(getState().orders,5)).toHaveLength(1);expect(tableOrders(getState().orders,1)).toHaveLength(0);});
});