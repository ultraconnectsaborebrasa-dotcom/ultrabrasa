import { z } from 'zod';
import { addressText, validateDelivery } from '@/lib/delivery';
import { paid, totals, type Order } from '@/lib/pdv-store';

// Contrato público publicado por UltraBrasa Entregas em /integracao-pdv.
const optionalText = (max: number) => z.string().trim().max(max).optional();
export const externalDeliverySchema = z.object({
  order_id: z.string().trim().min(1).max(120),
  order_number: optionalText(80),
  customer_name: z.string().trim().min(2).max(200),
  phone: optionalText(40),
  address: z.string().trim().min(5).max(600),
  neighborhood: optionalText(120),
  complement: optionalText(200),
  reference: optionalText(300),
  items: z.array(z.object({ name: z.string().trim().min(1).max(200), quantity: z.number().int().min(1).max(1000) }).strict()).min(1).max(100),
  total: z.number().min(0).max(1_000_000).multipleOf(0.01),
  delivery_fee: z.number().min(0).max(1_000_000).multipleOf(0.01).optional(),
  notes: optionalText(2000),
  created_at: z.string().datetime({ offset: true }).optional(),
  payment_status: optionalText(80),
  payment_method: optionalText(80),
  delivery_type: z.literal('delivery'),
  destination_latitude: z.number().min(-90).max(90).optional(),
  destination_longitude: z.number().min(-180).max(180).optional(),
}).strict().refine(value => (value.destination_latitude === undefined) === (value.destination_longitude === undefined), { message: 'Coordenadas devem ser enviadas em par.' });

export type ExternalDeliveryPayload = z.infer<typeof externalDeliverySchema>;
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const optional = (value: string | undefined) => value?.trim() || undefined;

export function buildExternalDeliveryPayload(order: Order): ExternalDeliveryPayload {
  if (order.type !== 'Delivery' || !order.delivery) throw new Error('Somente pedidos Delivery com endereço podem ser sincronizados.');
  const invalidAddress = validateDelivery(order.delivery);
  if (invalidAddress) throw new Error(invalidAddress);
  const address = order.delivery.address;
  const notes = [order.note, ...order.items.filter(item => item.note.trim()).map(item => `${item.qty}x ${item.name}: ${item.note}`)].filter(Boolean).join('\n');
  const total = cents(totals(order, 0).total);
  const latitude = optional(address.latitude);
  const longitude = optional(address.longitude);
  return externalDeliverySchema.parse({
    order_id: order.id,
    order_number: String(order.number),
    customer_name: order.customer,
    phone: optional(order.customerPhone),
    address: addressText(address),
    neighborhood: optional(address.neighborhood),
    complement: optional(address.complement),
    reference: optional(address.reference),
    items: order.items.map(item => ({ name: item.name, quantity: item.qty })),
    total,
    delivery_fee: cents(order.fee),
    notes: optional(notes),
    created_at: new Date(order.createdAt).toISOString(),
    payment_status: order.paymentStatus ?? (total > 0 && paid(order) >= total ? 'pago' : 'pendente'),
    payment_method: optional(order.delivery.paymentMethod),
    delivery_type: 'delivery',
    destination_latitude: latitude ? Number(latitude) : undefined,
    destination_longitude: longitude ? Number(longitude) : undefined,
  });
}

export const DELIVERY_CALLBACK_EVENTS = ['order.received', 'courier.assigned', 'courier.accepted', 'order.collected', 'delivery.started', 'delivery.completed', 'delivery.cancelled', 'delivery.failed'] as const;
export type DeliveryCallbackEvent = typeof DELIVERY_CALLBACK_EVENTS[number];

const callbackDate = z.string().datetime({ offset: true }).nullable().optional();
export const externalDeliveryCallbackSchema = z.object({
  event_id: z.string().uuid(),
  event: z.enum(DELIVERY_CALLBACK_EVENTS),
  revision: z.number().int().min(0).max(2_147_483_647),
  order_id: z.string().trim().min(1).max(120),
  delivery_id: z.string().uuid(),
  status: z.string().trim().min(1).max(120),
  occurred_at: z.string().datetime({ offset: true }),
  courier: z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).strict().nullable().optional(),
  assigned_at: callbackDate,
  collected_at: callbackDate,
  completed_at: callbackDate,
}).strict();
export type ExternalDeliveryCallback = z.infer<typeof externalDeliveryCallbackSchema>;

export function shouldApplyDeliveryRevision(incoming: number, latest: number | null): boolean {
  return latest === null || incoming > latest;
}

export function pdvStageForCallback(event: DeliveryCallbackEvent): 'entrega' | 'entregue' | 'cancelado' | null {
  if (event === 'delivery.started') return 'entrega';
  if (event === 'delivery.completed') return 'entregue';
  if (event === 'delivery.cancelled') return 'cancelado';
  return null;
}
