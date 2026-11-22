import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORDER_ALARM_TONES, WHATSAPP_MESSAGE_TONES, scheduleNotificationTones } from '@/lib/notification-tones';

function audioMock() {
  const oscillators: { type: OscillatorType; start: ReturnType<typeof vi.fn> }[] = [];
  const peaks: number[] = [];
  const context = {
    state: 'running',
    currentTime: 10,
    destination: {},
    createOscillator() {
      const oscillator = { type: 'sine' as OscillatorType, frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: (value: number) => { peaks.push(value); },
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    },
  };
  return { context: context as unknown as AudioContext, oscillators, peaks };
}

afterEach(() => vi.unstubAllGlobals());

describe('Perfis dos avisos sonoros', () => {
  it('usa somente duas notas senoidais e volume baixo na mensagem do WhatsApp', () => {
    const { context, oscillators, peaks } = audioMock();
    expect(scheduleNotificationTones(context, WHATSAPP_MESSAGE_TONES, 0.5)).toBe(true);
    expect(oscillators).toHaveLength(2);
    expect(oscillators.every(oscillator => oscillator.type === 'sine')).toBe(true);
    expect(peaks).toEqual([0.05, 0.04]);
  });

  it('usa oito pulsos intensos e mais altos no alarme de novo pedido', () => {
    const { context, oscillators, peaks } = audioMock();
    expect(scheduleNotificationTones(context, ORDER_ALARM_TONES, 0.85)).toBe(true);
    expect(oscillators).toHaveLength(8);
    expect(oscillators.every(oscillator => oscillator.type === 'square')).toBe(true);
    expect(Math.max(...peaks)).toBeCloseTo(0.391);
    expect(ORDER_ALARM_TONES.at(-1)?.start).toBe(1.76);
    expect(Math.max(...ORDER_ALARM_TONES.map(tone => tone.frequency))).toBeGreaterThan(Math.max(...WHATSAPP_MESSAGE_TONES.map(tone => tone.frequency)));
  });
});
