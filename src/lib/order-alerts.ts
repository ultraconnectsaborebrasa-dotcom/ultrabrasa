import { useSyncExternalStore } from 'react';
import { ORDER_ALARM_TONES, scheduleNotificationTones } from '@/lib/notification-tones';

export type AlertOrder = { id: string; number: number; status: string; type?: string | undefined; tableNumber?: number | undefined; items: { qty: number; name: string }[] };
let enabled = true;
const listeners = new Set<() => void>();
export function loadOrderAlerts() {
  try { enabled = localStorage.getItem('ultraconnect-order-alerts') !== 'false'; } catch {}
  listeners.forEach(fn => fn());
}
export function useOrderAlerts() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => enabled, () => true);
}
export function toggleOrderAlerts() {
  enabled = !enabled;
  try { localStorage.setItem('ultraconnect-order-alerts', String(enabled)); } catch {}
  listeners.forEach(fn => fn());
}
export function newKitchenOrders(previous: readonly AlertOrder[], current: readonly AlertOrder[]) {
  const seen = new Set(previous.filter(o => o.status === 'cozinha').map(o => o.id));
  return current.filter(o => o.status === 'cozinha' && !seen.has(o.id));
}

// Created only after an interaction, so browser autoplay restrictions remain respected.
let audio: AudioContext | undefined;
export async function unlockOrderSound() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') await audio.resume();
    return audio.state === 'running';
  } catch { return false; }
}
export function playOrderSound() {
  return audio ? scheduleNotificationTones(audio, ORDER_ALARM_TONES, 0.85) : false;
}
// System notification so staff are warned while the app is in another tab or minimized.
export async function requestOrderNotifications() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') { try { return await Notification.requestPermission(); } catch { return Notification.permission; } }
  return Notification.permission;
}
export function showOrderNotification(orders: readonly AlertOrder[], onClick?: () => void) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted' || !orders.length) return false;
  try {
    const title = orders.length === 1 ? `Novo pedido #${orders[0]?.number}` : `${orders.length} novos pedidos`;
    const body = orders.map(o => `#${o.number} · ${o.tableNumber ? `Mesa ${o.tableNumber}` : o.type ?? 'Cozinha'}`).join(' / ');
    const n = new Notification(title, { body, tag: 'ultra-new-order', requireInteraction: true, silent: false });
    n.onclick = () => { window.focus(); onClick?.(); n.close(); };
    return true;
  } catch { return false; }
}
