export type NotificationTone = {
  frequency: number;
  start: number;
  duration: number;
  gain: number;
  type: OscillatorType;
};

/** Toque curto e discreto para conversas; não compete com o alarme de pedidos. */
export const WHATSAPP_MESSAGE_TONES: readonly NotificationTone[] = [
  { frequency: 523.25, start: 0, duration: 0.22, gain: 0.1, type: 'sine' },
  { frequency: 659.25, start: 0.16, duration: 0.3, gain: 0.08, type: 'sine' },
];

/** Sequência original, alta e urgente, usada por todos os avisos de novo pedido. */
export const ORDER_ALARM_TONES: readonly NotificationTone[] = [
  { frequency: 880, start: 0, duration: 0.16, gain: 0.34, type: 'square' },
  { frequency: 1174.66, start: 0.18, duration: 0.2, gain: 0.4, type: 'square' },
  { frequency: 880, start: 0.48, duration: 0.16, gain: 0.34, type: 'square' },
  { frequency: 1174.66, start: 0.66, duration: 0.2, gain: 0.4, type: 'square' },
  { frequency: 880, start: 1.02, duration: 0.16, gain: 0.36, type: 'square' },
  { frequency: 1174.66, start: 1.2, duration: 0.2, gain: 0.42, type: 'square' },
  { frequency: 1046.5, start: 1.58, duration: 0.16, gain: 0.38, type: 'square' },
  { frequency: 1567.98, start: 1.76, duration: 0.42, gain: 0.46, type: 'square' },
];

const RECEIPT_TONES: readonly NotificationTone[] = [
  { frequency: 784, start: 0, duration: 0.18, gain: 0.14, type: 'sine' },
  { frequency: 988, start: 0.18, duration: 0.24, gain: 0.12, type: 'sine' },
];

export function scheduleNotificationTones(
  context: AudioContext,
  tones: readonly NotificationTone[],
  volume = 1,
): boolean {
  if (context.state !== 'running' || volume <= 0) return false;
  try {
    const start = context.currentTime;
    for (const tone of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + tone.start;
      oscillator.type = tone.type;
      oscillator.frequency.value = tone.frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(tone.gain * volume, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + tone.duration + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
    return true;
  } catch {
    return false;
  }
}

export function playReceiptTone(context: AudioContext, volume: number): boolean {
  return scheduleNotificationTones(context, RECEIPT_TONES, volume);
}
