import { supabase } from '@/integrations/supabase/client';
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}
export function validateContact(name: string, phone: string, consent: boolean): string | null {
  if (name.trim().length > 120) return 'O nome deve ter até 120 caracteres.';
  const digits = normalizePhone(phone);
  if (digits && !/^[1-9]\d{9,14}$/.test(digits)) return 'Informe um WhatsApp válido com DDD.';
  if (consent && !digits) return 'Informe o WhatsApp para registrar autorização.';
  return null;
}
export type Customer = { id: string; name: string; phone: string | null; promotion_consent: boolean; consent_at: string | null; created_at: string; updated_at: string; visits: number; lastVisit: string };
export async function readCustomers(): Promise<Customer[]> {
  const customers = await supabase.from('pdv_customers').select('*').order('updated_at', { ascending: false });
  if (customers.error) throw new Error(customers.error.message);
  const visits = await supabase.from('pdv_customer_visits').select('customer_id,created_at');
  if (visits.error) throw new Error(visits.error.message);
  return customers.data.map(c => {
    const own = visits.data.filter(v => v.customer_id === c.id);
    return { ...c, visits: own.length, lastVisit: own.reduce((last, v) => v.created_at > last ? v.created_at : last, c.created_at) };
  });
}
export const promotionEligible = (c: Pick<Customer, 'phone' | 'promotion_consent'>) => Boolean(c.phone && c.promotion_consent);
export function whatsappLink(phone: string, message: string) { return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`; }
export function customersCsv(customers: Customer[]): string {
  const escape = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"`;
  return '\ufeffNome;WhatsApp;Atendimentos;Último atendimento\r\n' + customers.filter(promotionEligible).map(c => [c.name, c.phone ?? '', String(c.visits), new Date(c.lastVisit).toLocaleString('pt-BR')].map(escape).join(';')).join('\r\n');
}