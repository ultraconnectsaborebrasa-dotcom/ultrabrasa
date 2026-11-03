import { describe,it,expect } from 'vitest';
import {defaultBusiness,businessPeriod,inEunapolis,conversationDraftSchema,missingOrderFields} from '@/lib/whatsapp-business';
describe('WhatsApp business rules',()=>{
  it('uses the specified marmita price',()=>expect(defaultBusiness.lunchPrice).toBe(19.90));
  it('keeps the six specified ingredients',()=>expect(defaultBusiness.lunchMenu).toBe('carne assada, linguiça de frango, arroz, salada, macarrão e farofa de feijão'));
  it('enables free delivery inside Eunapolis',()=>expect(defaultBusiness.freeDelivery&&inEunapolis('Eunápolis')).toBe(true));
  it('does not treat outside cities as the promotion area',()=>expect(inEunapolis('Porto Seguro')).toBe(false));
  it('starts advance orders at 10h',()=>expect(defaultBusiness.advanceFrom).toBe('10:00'));
  it('starts departure at 11h',()=>expect(defaultBusiness.departureFrom).toBe('11:00'));
  it('does not invent missing business hours',()=>expect(businessPeriod(defaultBusiness)).toBe('closed'));
  it('requires an explicit cash change response',()=>expect(missingOrderFields(conversationDraftSchema.parse({payment:'Dinheiro'}))).toContain('troco (ou sem troco)'));
  it('does not re-request a supplied name',()=>expect(missingOrderFields(conversationDraftSchema.parse({customer:'Ana'}))).not.toContain('nome'));
  it('opens for advance orders at 10 local time',()=>expect(businessPeriod({...defaultBusiness,hours:[{day:2,lunchEnd:'14:00',nightStart:'18:00',nightEnd:'23:00'}]},new Date('2026-11-03T13:00:00Z'))).toBe('lunch'));
  it('is closed before 10 local time',()=>expect(businessPeriod({...defaultBusiness,hours:[{day:2,lunchEnd:'14:00',nightStart:'18:00',nightEnd:'23:00'}]},new Date('2026-11-03T12:59:00Z'))).toBe('closed'));
});