import { describe,it,expect } from 'vitest';
import {defaultBusiness,businessPeriod,inEunapolis,conversationDraftSchema,missingOrderFields} from '@/lib/whatsapp-business';
describe('WhatsApp business rules',()=>{
  it('uses the specified marmita price',()=>expect(defaultBusiness.lunchPrice).toBe(19.90));
  it('keeps the six specified ingredients',()=>expect(defaultBusiness.lunchMenu.split(',').length).toBe(5));
  it('enables free delivery inside Eunapolis',()=>expect(defaultBusiness.freeDelivery&&inEunapolis('Eunápolis')).toBe(true));
  it('does not treat outside cities as the promotion area',()=>expect(inEunapolis('Porto Seguro')).toBe(false));
  it('starts advance orders at 10h',()=>expect(defaultBusiness.advanceFrom).toBe('10:00'));
  it('starts departure at 11h',()=>expect(defaultBusiness.departureFrom).toBe('11:00'));
  it('does not invent missing business hours',()=>expect(businessPeriod(defaultBusiness)).toBe('closed'));
  it('requires an explicit cash change response',()=>expect(missingOrderFields(conversationDraftSchema.parse({payment:'Dinheiro'}))).toContain('troco (ou sem troco)'));
  it('does not re-request a supplied name',()=>expect(missingOrderFields(conversationDraftSchema.parse({customer:'Ana'}))).not.toContain('nome'));
});