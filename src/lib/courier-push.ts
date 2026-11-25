export function courierPushMessage(token: string, eventId: string) {
  return { message: { token, data: { title: 'Nova entrega para você', body: 'Abra o aplicativo para conferir o pedido e iniciar sua rota.', eventId, path: '/' }, android: { priority: 'HIGH', ttl: '900s' } } };
}

export function courierInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => Array.from(part)[0] ?? '').join('').toLocaleUpperCase('pt-BR') || '?';
}