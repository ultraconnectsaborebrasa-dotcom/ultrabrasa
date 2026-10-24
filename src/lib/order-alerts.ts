import { useSyncExternalStore } from 'react';

export type AlertOrder = { id: string; number: number; status: string; type?: string; tableNumber?: number; items: { qty: number; name: string }[] };
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
  if (!audio || audio.state !== 'running') return false;
  try {
    const start = audio.currentTime;
    [660, 880, 1100].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const at = start + index * 0.18;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.18, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(at); oscillator.stop(at + 0.32);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
    return true;
  } catch { return false; }
}