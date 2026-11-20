import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { addressText, type Delivery, type DeliveryRoute } from '@/lib/delivery';
import type { CourierOperations, DeliveryRouteCalculation } from '@/lib/courier-operations';
import { deliveryCoordinates } from '@/lib/delivery';
import type { Json } from '@/integrations/supabase/types';

export const calculateDeliveryRoute = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ routeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DeliveryRouteCalculation> => {
    const [{ data: isAdmin }, { data: isCashier }, { data: isCourier }] = await Promise.all([
      context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' }),
      context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'cashier' }),
      context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'courier' }),
    ]);
    if (!isAdmin && !isCashier && !isCourier) throw new Error('Somente o administrador, o caixa ou o entregador designado pode calcular esta rota.');
    const [boardResult, operationsResult] = await Promise.all([
      context.supabase.rpc('read_delivery_board'),
      context.supabase.rpc('read_courier_operations'),
    ]);
    if (boardResult.error) throw new Error(boardResult.error.message);
    if (operationsResult.error) throw new Error(operationsResult.error.message);
    const board = boardResult.data as unknown as { deliveries: Delivery[]; routes: DeliveryRoute[] };
    const operations = operationsResult.data as unknown as CourierOperations;
    const route = board.routes.find(item => item.id === data.routeId);
    if (!route) throw new Error('Rota não encontrada ou não atribuída a esta conta.');
    if (!operations.base) throw new Error('Configure a base antes de calcular a rota.');
    const deliveries = board.deliveries.filter(item => item.route_id === route.id).sort((a, b) => a.position - b.position);
    if (!deliveries.length) throw new Error('Esta rota não possui entregas.');
    if (deliveries.length > 10) throw new Error('Para calcular o trajeto no mapa, divida a rota em grupos de até 10 entregas.');

    const gatewayKey = process.env['LOVABLE_API_KEY'];
    const connectionKey = process.env['GOOGLE_MAPS_API_KEY_1'];
    if (!gatewayKey || !connectionKey) throw new Error('A conexão com o Google Maps ainda não está configurada.');
    const callGoogle = async (path: string, init?: RequestInit): Promise<Response> => {
      const response = await fetch(`https://connector-gateway.lovable.dev/google_maps${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
          'X-Connection-Api-Key': connectionKey,
          Accept: 'application/json',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error(`Google Maps request failed [${response.status}]: ${body}`);
        if (response.status === 403) {
          const details = (() => {
            try {
              return (JSON.parse(body) as { error?: { details?: { reason?: string }[] } }).error?.details ?? [];
            } catch {
              return [];
            }
          })();
          const reason = details.find(detail => detail.reason)?.reason;
          if (reason === 'API_KEY_HTTP_REFERRER_BLOCKED') {
            throw new Error('A chave UltraBrasa Servidor está restrita a sites. No Google Cloud, deixe as restrições de aplicativo dela como "Nenhum" ou "Endereços IP".');
          }
          if (reason === 'API_KEY_SERVICE_BLOCKED') {
            throw new Error('A chave UltraBrasa Servidor não libera um serviço necessário. No Google Cloud, permita Routes API e Geocoding API nessa chave.');
          }
          throw new Error('O Google Maps recusou a chave do servidor. Confira as restrições da chave UltraBrasa Servidor no Google Cloud.');
        }
        throw new Error(`O Google Maps respondeu com erro ${response.status}: ${body.slice(0, 240)}`);
      }
      return response;
    };

    const stops = [] as DeliveryRouteCalculation['stops'];
    for (const delivery of deliveries) {
      let latitude = Number(delivery.address.latitude);
      let longitude = Number(delivery.address.longitude);
      if (!delivery.address.latitude || !delivery.address.longitude || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        const query = encodeURIComponent(`${addressText(delivery.address)}, Eunápolis, BA, Brasil`);
        const response = await callGoogle(`/maps/api/geocode/json?address=${query}&region=br&language=pt-BR`);
        const result = await response.json() as { status?: string; error_message?: string; results?: { geometry?: { location?: { lat?: number; lng?: number } } }[] };
        const location = result.results?.[0]?.geometry?.location;
        if (result.status !== 'OK' || typeof location?.lat !== 'number' || typeof location.lng !== 'number') {
          throw new Error(`Não foi possível localizar o endereço do pedido #${delivery.number}. Revise o endereço antes de calcular a rota. ${result.error_message ?? result.status ?? ''}`.trim());
        }
        latitude = location.lat;
        longitude = location.lng;
      }
      stops.push({ delivery_id: delivery.id, customer: delivery.customer, latitude, longitude });
    }

    const point = (location: { latitude: number; longitude: number }) => ({ location: { latLng: location } });
    const destination = stops[stops.length - 1];
    if (!destination) throw new Error('A rota precisa de pelo menos um destino.');
    const response = await callGoogle('/routes/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' },
      body: JSON.stringify({
        origin: point({ latitude: operations.base.base_latitude, longitude: operations.base.base_longitude }),
        destination: point(destination),
        ...(stops.length > 1 ? { intermediates: stops.slice(0, -1).map(point) } : {}),
        travelMode: 'DRIVE',
        computeAlternativeRoutes: false,
        languageCode: 'pt-BR',
        units: 'METRIC',
      }),
    });
    const result = await response.json() as { routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[] };
    const calculated = result.routes?.[0];
    if (!calculated?.polyline?.encodedPolyline) throw new Error('O Google Maps não encontrou um trajeto para esta sequência de entregas.');
    return {
      polyline: calculated.polyline.encodedPolyline,
      distance_meters: calculated.distanceMeters ?? 0,
      duration_seconds: Number(calculated.duration?.replace(/s$/, '')) || 0,
      stops,
    };
  });

export const locateDeliveryOnMap = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ deliveryId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isCashier }] = await Promise.all([
      context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' }),
      context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'cashier' }),
    ]);
    if (!isAdmin && !isCashier) throw new Error('Somente o administrador ou o caixa pode localizar entregas para designação.');
    const boardResult = await context.supabase.rpc('read_delivery_board');
    if (boardResult.error) throw new Error(boardResult.error.message);
    const board = boardResult.data as unknown as { deliveries: Delivery[] };
    const delivery = board.deliveries.find(item => item.id === data.deliveryId && ['Pronto para entrega', 'Em rota'].includes(item.status) && !item.route_id);
    if (!delivery) throw new Error('Esta saída não está mais disponível no acompanhamento atual.');
    const existing = deliveryCoordinates(delivery);
    if (existing) return { deliveryId: delivery.id, ...existing };

    const gatewayKey = process.env['LOVABLE_API_KEY'];
    const connectionKey = process.env['GOOGLE_MAPS_API_KEY_1'];
    if (!gatewayKey || !connectionKey) throw new Error('A conexão com o Google Maps ainda não está configurada.');
    const query = encodeURIComponent(`${addressText(delivery.address)}, Eunápolis, BA, Brasil`);
    const response = await fetch(`https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${query}&region=br&language=pt-BR`, {
      headers: { Authorization: `Bearer ${gatewayKey}`, 'X-Connection-Api-Key': connectionKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Google Maps geocoding failed [${response.status}]: ${body}`);
      if (response.status === 403) {
        const details = (() => {
          try { return (JSON.parse(body) as { error?: { details?: { reason?: string }[] } }).error?.details ?? []; }
          catch { return []; }
        })();
        const reason = details.find(detail => detail.reason)?.reason;
        if (reason === 'API_KEY_HTTP_REFERRER_BLOCKED') throw new Error('A chave UltraBrasa Servidor está restrita a sites. No Google Cloud, deixe as restrições de aplicativo dela como "Nenhum" ou "Endereços IP".');
        if (reason === 'API_KEY_SERVICE_BLOCKED') throw new Error('A chave UltraBrasa Servidor não libera a Geocoding API. No Google Cloud, adicione esse serviço às permissões da chave.');
        throw new Error('O Google Maps recusou a chave do servidor. Confira as restrições da chave UltraBrasa Servidor no Google Cloud.');
      }
      throw new Error(`O Google Maps respondeu com erro ${response.status}: ${body.slice(0, 240)}`);
    }
    const result = await response.json() as { status?: string; error_message?: string; results?: { geometry?: { location?: { lat?: number; lng?: number } } }[] };
    const location = result.results?.[0]?.geometry?.location;
    if (result.status !== 'OK' || typeof location?.lat !== 'number' || typeof location.lng !== 'number' || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) {
      throw new Error(`Não foi possível localizar o endereço do pedido #${delivery.number}. Revise o endereço. ${result.error_message ?? result.status ?? ''}`.trim());
    }
    const position = { latitude: location.lat, longitude: location.lng };
    const address = { ...delivery.address, latitude: String(position.latitude), longitude: String(position.longitude) };
    const { error } = await context.supabase.rpc('update_delivery_address', { delivery_id: delivery.id, input: address as unknown as Json });
    if (error) throw new Error(`O endereço foi localizado, mas não foi possível salvar: ${error.message}`);
    return { deliveryId: delivery.id, ...position };
  });
