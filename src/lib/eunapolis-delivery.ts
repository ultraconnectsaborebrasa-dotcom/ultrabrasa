import type { DeliveryAddress, Delivery } from './delivery';

// Municipal collection routes are operational groupings, not delivery travel-time estimates.
export const EUNAPOLIS_SOURCE = 'https://www.eunapolis.ba.gov.br/Handler.ashx?f=f&query=fd16fe26-b167-4674-a80c-c8eb2777b531.pdf';
export const DELIVERY_ZONES = [
  { id: 'centro', name: '01 · Centro', neighborhoods: ['Vivendas Costa Azul', 'Costa Rica', 'Edgar Trancoso', 'Jardins de Eunápolis', 'Jardins da Acácias', 'Centro'] },
  { id: 'santa-lucia', name: '02 · Santa Lúcia', neighborhoods: ['Alamar', 'Colonial', 'Antares', 'Centauro', 'Santa Lúcia', 'Colônia Residence', 'Jequitaia'] },
  { id: 'dinah-borges', name: '03 · Dinah Borges', neighborhoods: ['Dinah Borges I', 'Dinah Borges II', 'Dinah Borges III', 'Alto do Boa Vista', 'Urbis I', 'Urbis II', 'Ivan Moura', 'Encanto das Águas I', 'Encanto das Águas II', 'Niterói I', 'Niterói II', 'Niterói III', 'Motor'] },
  { id: 'pequi', name: '04 · Pequi', neighborhoods: ['Pequi', 'Cajueiro'] },
  { id: 'gusmao', name: '05 · Gusmão', neighborhoods: ['Moisés Reis', 'Aldeia do Bosque', 'Gusmão'] },
  { id: 'alecrim', name: '06 · Alecrim', neighborhoods: ['Thiago de Melo II', 'Santa Edwirgens', 'Santa Izabel', 'Urbis III', 'Minas Gerais', 'Recantos das Árvores I', 'Recantos das Árvores II'] },
  { id: 'juca-rosa', name: '07 · Juca Rosa', neighborhoods: ['Rosa Neto', 'Nova Eunápolis', 'Sapucaeira', 'Alegria', 'Juca Rosa', 'Alvorada'] },
  { id: 'arnaldao', name: '08 · Arnaldão', neighborhoods: ['Renovação I', 'Renovação II', 'Renovação III', 'Itapoã', 'Stela Reis', 'Vila Olímpica', 'Paquetá', 'Arisvaldo Reis', 'Thiago de Melo I', 'Vista Alegre', 'Nacional', 'Arnaldão', 'Talismã', 'Distrito Industrial', 'Jardins Amendoeira'] },
  { id: 'rural', name: 'Rural · Localidades', neighborhoods: ['Colônia', 'Mundo Novo', 'Gabiarra', 'Roça do Povo', 'Projeto Maravilha Km 12', 'Delta Parque I', 'Delta Parque II', 'Loteamento América', 'Green Gold'] },
];
export const EUNAPOLIS_NEIGHBORHOODS = DELIVERY_ZONES.flatMap(z => z.neighborhoods).sort((a,b) => a.localeCompare(b,'pt-BR'));
const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const aliases: Record<string,string> = { 'estela reis':'stela reis', 'santa isabel':'santa izabel', 'dina borges':'dinah borges i', 'dinah borges':'dinah borges i', 'niteroi':'niteroi i', 'renovacao':'renovacao i', 'encanto das aguas':'encanto das aguas i', 'recanto das arvores':'recantos das arvores i', 'recanto das arvores i':'recantos das arvores i', 'recanto das arvores ii':'recantos das arvores ii' };
export function deliveryZone(address: Pick<DeliveryAddress,'neighborhood'|'city'|'state'>) {
  if (address.city.trim() && normalize(address.city) !== 'eunapolis') return undefined;
  if (address.state.trim() && normalize(address.state) !== 'ba') return undefined;
  const name = normalize(address.neighborhood);
  return DELIVERY_ZONES.find(z => z.neighborhoods.some(n => normalize(n) === (aliases[name] ?? name)));
}
export function zoneBatch(deliveries: Delivery[], zoneId: string) {
  return deliveries.filter(d => !d.route_id && ['Aguardando preparo','Pronto para entrega'].includes(d.status) && (deliveryZone(d.address)?.id ?? 'unassigned') === zoneId)
    .sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(0,10);
}