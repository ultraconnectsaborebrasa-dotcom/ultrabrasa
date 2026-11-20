export type GoogleGeocodingResult = {
  status?: string;
  error_message?: string;
};

/** Traduz falhas do provedor sem confundir bloqueio de credencial com endereço inválido. */
export function geocodingFailureMessage(result: GoogleGeocodingResult, orderNumber: number): string {
  const providerMessage = result.error_message ?? '';
  if (result.status === 'REQUEST_DENIED' || /not authorized to use this service|api key is not authorized/i.test(providerMessage)) {
    return `O Google bloqueou a localização do pedido #${orderNumber}. Ative a Geocoding API no Google Cloud e inclua esse serviço nas permissões da chave UltraBrasa Servidor. O endereço está salvo; você ainda pode designar a entrega sem o mapa.`;
  }
  if (result.status === 'ZERO_RESULTS') {
    return `Não foi possível localizar o endereço do pedido #${orderNumber}. Revise rua, número e bairro. Você ainda pode designar a entrega sem o mapa.`;
  }
  return `Não foi possível localizar o endereço do pedido #${orderNumber}. Revise o endereço ou tente novamente. Você ainda pode designar a entrega sem o mapa.`;
}
