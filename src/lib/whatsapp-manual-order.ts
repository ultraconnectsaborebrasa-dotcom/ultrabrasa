import { emptyDelivery, type DeliveryInput } from './delivery';
import {
  conversationDraftSchema,
  customerNameWithProfile,
  missingOrderFields,
  validAddressField,
} from './whatsapp-business';
import { ruleParse } from './whatsapp-rulebot';

export type ManualOrderMessage = { direction: string; kind: string; body: string | null };
export type WhatsAppManualOrder = {
  phone: string;
  customer: string;
  type: 'Delivery' | 'Retirada' | null;
  delivery?: DeliveryInput;
  paymentLabel: string;
};

/**
 * Organiza dados para o atendente revisar. Não escolhe produtos nem salva pedidos.
 * O rastreamento segue a ordem da conversa para que a correção mais recente prevaleça.
 */
export function suggestWhatsAppManualOrder(
  phone: string,
  whatsappName: string | null | undefined,
  messages: ManualOrderMessage[],
): WhatsAppManualOrder {
  let draft = conversationDraftSchema.parse({});
  for (const message of messages) {
    const body = message.body?.trim();
    if (message.direction !== 'in' || message.kind !== 'text' || !body) continue;
    draft = ruleParse(body, draft, '', missingOrderFields(draft)).draft;
  }

  const customer = customerNameWithProfile(draft.customer, whatsappName);
  const address = {
    street: validAddressField('street', draft.address.street, draft) ? draft.address.street.trim() : '',
    number: validAddressField('number', draft.address.number, draft) ? draft.address.number.trim() : '',
    neighborhood: validAddressField('neighborhood', draft.address.neighborhood, draft) ? draft.address.neighborhood.trim() : '',
    reference: draft.address.reference.trim(),
    complement: draft.address.complement.trim(),
  };
  const hasDeliveryData = draft.type === 'Delivery' || Object.values(address).some(Boolean);
  let delivery: DeliveryInput | undefined;
  if (hasDeliveryData) {
    delivery = emptyDelivery();
    delivery.address = { ...delivery.address, ...address };
    if (draft.payment === 'Pix' || draft.payment === 'Dinheiro') delivery.paymentMethod = draft.payment;
    if (draft.payment === 'Dinheiro' && draft.cashFor !== null) delivery.cashFor = String(draft.cashFor);
  }

  return {
    phone,
    customer,
    type: hasDeliveryData ? 'Delivery' : draft.type,
    delivery,
    paymentLabel: draft.payment ?? '',
  };
}
