import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OperatorDesk } from '@/components/pdv/OperatorDesk';
import { readOperator } from '@/lib/pdv-operator';
const send=vi.fn().mockResolvedValue({number:7});
vi.mock('@/lib/pdv-operator',async importOriginal=>({...await importOriginal<typeof import('@/lib/pdv-operator')>(),readOperator:vi.fn().mockResolvedValue({products:[{id:'espeto',name:'Espeto',category:'Espetinhos',stock:20,price:8}],orders:[],ownOrders:3,ownSales:2}),submitOperator:(r:unknown)=>send(r)}));
afterEach(()=>{cleanup();send.mockClear();});
describe('Atendimento com preços e envio protegido',()=>{
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
 it('sends Delivery address and opens deliveries after submission',async()=>{
  render(<OperatorDesk name="Atendente" signOut={async()=>{}}/>);
  fireEvent.click(await screen.findByRole('button',{name:/Espeto/}));
  fireEvent.click(screen.getByRole('button',{name:'Delivery'}));
  fireEvent.change(screen.getByLabelText('Bairro *'),{target:{value:'Stela Reis'}});
  fireEvent.change(screen.getByLabelText('Rua *'),{target:{value:'Rua A'}});
  fireEvent.change(screen.getByLabelText('Número *'),{target:{value:'2'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar à cozinha'}));
  await waitFor(()=>expect(send).toHaveBeenCalledOnce());
  expect(send.mock.calls[0]?.[0]).toMatchObject({type:'Delivery',delivery:{address:{neighborhood:'Stela Reis',street:'Rua A',number:'2',city:'Eunápolis',state:'BA'}}});
  expect(await screen.findByRole('heading',{name:'Rotas de entrega'})).toBeInTheDocument();
 });
 it('mostra preço, subtotal e o total retornado pelo servidor incluindo ajustes',async()=>{
  vi.mocked(readOperator).mockResolvedValueOnce({products:[],ownOrders:1,ownSales:0,orders:[{id:'order-test',number:18,type:'Mesa',tableNumber:2,customer:'',status:'cozinha',createdAt:1,note:'',own:true,total:29.5,items:[{name:'Espeto',qty:3,price:8,note:'Ao ponto'}]}]});
  render(<OperatorDesk name="Atendente" signOut={async()=>{}}/>);
  await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
  fireEvent.click(screen.getByRole('button',{name:'Preparação'}));
  expect(screen.getByText(/R\$\s*8,00/)).toBeDefined();
  expect(screen.getByText(/R\$\s*24,00/)).toBeDefined();
  expect(screen.getByText(/R\$\s*29,50/)).toBeDefined();
 });
});