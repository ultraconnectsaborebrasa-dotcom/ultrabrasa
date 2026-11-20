import { describe, expect, it } from 'vitest';
import { geocodingFailureMessage } from '@/lib/google-geocoding';

describe('falhas de localização no Google', () => {
  it('identifica a recusa da Geocoding API sem culpar o endereço do pedido', () => {
    const message = geocodingFailureMessage({
      status: 'REQUEST_DENIED',
      error_message: 'This API key is not authorized to use this service or API.',
    }, 4);
    expect(message).toContain('pedido #4');
    expect(message).toContain('Geocoding API');
    expect(message).toContain('designar a entrega sem o mapa');
    expect(message).not.toContain('Revise o endereço');
  });

  it('pede revisão somente quando o Google não encontra o endereço', () => {
    const message = geocodingFailureMessage({ status: 'ZERO_RESULTS' }, 4);
    expect(message).toContain('Revise rua, número e bairro');
    expect(message).toContain('designar a entrega sem o mapa');
  });
});
