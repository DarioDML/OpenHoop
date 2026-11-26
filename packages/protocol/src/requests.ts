const REVISION_1 = 1;
const KEY_FIELD = 32;
const ASCII_MAX = 0x7f;

export const ALERT_EFFECTS: readonly number[] = [47, 152];
const EFFECT_SLOTS = 8;
export const MAX_HAPTIC_LOOPS = 0xff;

export type ConfigWriteValue = '1' | '2';

export function asciiField(text: string): Uint8Array {
  if (text.length === 0 || text.length >= KEY_FIELD) throw new RangeError(`field must hold 1 to ${KEY_FIELD - 1} characters`);
  const out = new Uint8Array(KEY_FIELD);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > ASCII_MAX) throw new RangeError('field must be ASCII');
    out[i] = c;
  }
  return out;
}

function effectSlots(effects: readonly number[]): Uint8Array {
  if (effects.length > EFFECT_SLOTS) throw new RangeError(`at most ${EFFECT_SLOTS} waveform effects`);
  const out = new Uint8Array(EFFECT_SLOTS);
  effects.forEach((effect, i) => {
    if (!Number.isInteger(effect) || effect < 0 || effect > 0xff) throw new RangeError('waveform effect must be a byte');
    out[i] = effect;
  });
  return out;
}

export function hapticPatternBody(loops: number): Uint8Array {
  if (!Number.isInteger(loops) || loops < 1 || loops > MAX_HAPTIC_LOOPS) throw new RangeError(`loops must be 1 to ${MAX_HAPTIC_LOOPS}`);
  const out = new Uint8Array(12);
  out[0] = REVISION_1;
  out.set(effectSlots(ALERT_EFFECTS), 1);
  out[11] = loops;
  return out;
}

export function stopHapticsBody(): Uint8Array {
  return Uint8Array.of(REVISION_1);
}

export function configWriteBody(key: string, value: ConfigWriteValue): Uint8Array {
  const out = new Uint8Array(1 + 2 * KEY_FIELD);
  out[0] = REVISION_1;
  out.set(asciiField(key), 1);
  out.set(asciiField(value), 1 + KEY_FIELD);
  return out;
}

export function configReadBody(key: string): Uint8Array {
  const out = new Uint8Array(1 + KEY_FIELD);
  out[0] = REVISION_1;
  out.set(asciiField(key), 1);
  return out;
}

export function hrProfileBody(on: boolean): Uint8Array {
  return Uint8Array.of(REVISION_1, on ? 1 : 0);
}
