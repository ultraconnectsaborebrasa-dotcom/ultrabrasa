import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OperatorDesk } from '@/components/pdv/OperatorDesk';
const send=vi.fn().mockResolvedValue({number:7});
vi.mock('@/lib/pdv-operator',()=>({emptyOperator:{products:[],orders:[],ownOrders:0,ownSales:0},readOperator:vi.fn().mockResolvedValue({products:[{id:'espeto',name:'Espeto',category:'Espetinhos',stock:20}],orders:[],ownOrders:3,ownSales:2}),submitOperator:(r:unknown)=>send(r)}));
afterEach(()=>{cleanup();send.mockClear();});
describe('Vendedor sem valores',()=>{
 it('envia apenas produto, quantidade e mesa sem preços nem pagamentos',async()=>{
  render(<OperatorDesk name="Atendente" signOut={async()=>{}}/>);
  await screen.findByRole('button',{name:/Espeto/});
  fireEvent.click(screen.getByRole('button',{name:/Espeto/}));
  fireEvent.click(screen.getByRole('button',{name:'Mesa 3'}));
  fireEvent.change(screen.getByLabelText('Especificação do item'),{target:{value:'Sem sal'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar à cozinha'}));
  await waitFor(()=>expect(send).toHaveBeenCalledOnce());
  const request=send.mock.calls[0]?.[0];
  expect(request.tableNumber).toBe(3);expect(request.items).toEqual([{productId:'espeto',qty:1,note:'Sem sal'}]);
  expect(request).not.toHaveProperty('price');expect(request).not.toHaveProperty('payments');
 });
});