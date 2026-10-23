export type DeliveryAddress = { label: string; street: string; number: string; neighborhood: string; city: string; state: string; postalCode: string; complement: string; reference: string; latitude: string; longitude: string };
export type DeliveryInput = { address: DeliveryAddress; paymentMethod: string; cashFor: string };
export const emptyAddress = (): DeliveryAddress => ({label:'Casa',street:'',number:'',neighborhood:'',city:'',state:'',postalCode:'',complement:'',reference:'',latitude:'',longitude:''});
export const emptyDelivery = (): DeliveryInput => ({address:emptyAddress(),paymentMethod:'Pix',cashFor:''});
export const DELIVERY_STATUSES = ['Aguardando preparo','Pronto para entrega','Em rota','Entregue','Cancelado'] as const;
export type DeliveryStatus = typeof DELIVERY_STATUSES[number];
export type Delivery = { id:string; order_id:string; number:number; customer:string; phone:string; address:DeliveryAddress; created_at:string; delivered_at:string|null; status:DeliveryStatus; route_id:string|null; position:number; courier_id:string|null; total:number|null; due:number|null; payment_method:string; change:number|null; problem:string|null; items:{name:string;qty:number;note?:string}[] };
export type Courier = {id:string;name:string;phone:string;user_id:string|null;active:boolean};
export type DeliveryRoute = {id:string;name:string;courier_id:string|null;created_at:string;origin:string;distance_meters:number|null;duration_seconds:number|null};
export function validateDelivery(input:DeliveryInput|undefined):string|null {
  if(!input?.address.neighborhood.trim()||!input.address.street.trim()||!input.address.number.trim())return 'Informe bairro, rua e número para entrega.';
  const a=input.address;
  if((a.latitude!==''||a.longitude!=='')&&(!a.latitude||!a.longitude||!Number.isFinite(Number(a.latitude))||!Number.isFinite(Number(a.longitude))||Math.abs(Number(a.latitude))>90||Math.abs(Number(a.longitude))>180))return 'Informe latitude e longitude válidas.';
  if(input.cashFor&&(!Number.isFinite(Number(input.cashFor))||Number(input.cashFor)<0))return 'Informe um valor válido para troco.';
  return null;
}
export const addressText = (a:DeliveryAddress) => [a.street,a.number,a.complement,a.neighborhood,a.city,a.state,a.postalCode].filter(Boolean).join(', ');
export const mapLocation = (a:DeliveryAddress) => a.latitude&&a.longitude?`${a.latitude},${a.longitude}`:addressText(a);
export function googleMapsLink(address:DeliveryAddress) {return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapLocation(address))}`;}
export function routeMapsLink(deliveries:Delivery[],origin:string):string|null {
  if(!deliveries.length||deliveries.length>10)return null;
  const locations=deliveries.map(d=>mapLocation(d.address));const destination=locations.pop();
  const params=new URLSearchParams({api:'1',travelmode:'driving',destination:destination??''});
  if(origin.trim())params.set('origin',origin.trim());if(locations.length)params.set('waypoints',locations.join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}
export const sortDeliveries = (deliveries:Delivery[]) => [...deliveries].sort((a,b)=>`${a.address.neighborhood} ${a.address.street}`.localeCompare(`${b.address.neighborhood} ${b.address.street}`,'pt-BR',{sensitivity:'base'})||a.address.number.localeCompare(b.address.number,'pt-BR',{numeric:true}));
export function routeTotals(deliveries:Delivery[]) {
  const result={total:0,cash:0,card:0,pix:0,other:0};
  deliveries.forEach(d=>{result.total+=d.total??0;const due=d.due??0;const method=d.payment_method.toLowerCase();if(method==='dinheiro')result.cash+=due;else if(method==='pix')result.pix+=due;else if(/crédito|débito|cartão/.test(method))result.card+=due;else result.other+=due;});return result;
}
export const isLateDelivery=(d:Pick<Delivery,'created_at'|'status'>,minutes:number,now=Date.now())=>!['Entregue','Cancelado'].includes(d.status)&&now-new Date(d.created_at).getTime()>minutes*60000;