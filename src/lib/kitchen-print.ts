import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Order } from '@/lib/pdv-store';
import { printOrder, printerPreferences } from '@/services/thermalPrinter';

type KitchenOrderProjection = {
  id: string;
  number: number;
  type: Order['type'];
  tableNumber?: number;
  customer: string;
  customerPhone?: string;
  status: Order['status'];
  createdAt?: number;
  note?: string;
  items: { name: string; qty: number; price: number; note?: string }[];
};

export function printableKitchenOrder(order: KitchenOrderProjection): Order {
  return {
    id: order.id,
    number: order.number,
    type: order.type,
    tableNumber: order.tableNumber,
    customer: order.customer,
    customerPhone: order.customerPhone,
    status: order.status,
    createdAt: order.createdAt ?? Date.now(),
    note: order.note ?? '',
    discount: 0,
    fee: 0,
    serviceFee: false,
    payments: [],
    items: order.items.map((item, index) => ({
      uid: `${order.id}-${index}`,
      productId: '',
      name: item.name,
      qty: item.qty,
      price: item.price,
      note: item.note ?? '',
    })),
  };
}

// O aceite já grava o pedido. Uma falha de impressora não pode desfazer nem repetir esse aceite.
export async function autoPrintKitchenOrderById(orderId: string): Promise<boolean> {
  if (!printerPreferences.autoPrintEnabled) return false;
  let number = '';
  try {
    const { data, error } = await supabase.rpc('read_pdv_cashier' as never);
    if (error) throw new Error(error.message);
    const orders = (data as unknown as { orders?: KitchenOrderProjection[] } | null)?.orders ?? [];
    const found = orders.find(order => order.id === orderId);
    if (!found) throw new Error('comanda recém-criada não encontrada');
    number = ` #${found.number}`;
    // Sem "manual": a fila da impressora deduplica esta chamada e a sincronização do PDV.
    await printOrder(printableKitchenOrder(found), 0, { target: 'kitchen' });
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'verifique o QZ Tray e a impressora selecionada';
    toast.error(`Pedido${number} aceito, mas a comanda não foi impressa: ${detail}`);
    return false;
  }
}

export function shouldAutoPrintSubmittedOrder(status: string): boolean {
  return status === 'cozinha' || status === 'pronto';
}

// Marmitas já entram prontas: o aceite imprime independentemente da etapa de preparo.
export async function autoPrintAcceptedOrder(accepted: unknown): Promise<boolean> {
  const orderId = accepted && typeof accepted === 'object' ? (accepted as { id?: unknown }).id : null;
  return typeof orderId === 'string' && orderId ? autoPrintKitchenOrderById(orderId) : false;
}
