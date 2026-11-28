const REVISION_1 = 1;
const KEY_FIELD = 32;
const ASCII_MAX = 0x7f;

export const ALERT_EFFECTS: readonly number[] = [47, 152];
const EFFECT_SLOTS = 8;
export const MAX_HAPTIC_LOOPS = 6;

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
  return Uint8Array.of(on ? 1 : 0);
}

export const MIN_ALARM_LEAD_S = 60;
export const ALARM_SLOT_MIN = 1;
export const ALARM_SLOT_MAX = 6;
const ALARM_REVISION = 4;
const ALARM_SLOT_REVISION = 2;
const ALARM_ALL_SLOTS = 0xff;
const RTC_TICKS_PER_S = 32768;

export interface AlarmHaptics {
  effects: readonly number[];
  effectLoops: number;
  patternLoops: number;
  durationS: number;
}

export const BAND_ALARM_HAPTICS: AlarmHaptics = { effects: ALERT_EFFECTS, effectLoops: 0, patternLoops: 7, durationS: 30 };

function checkSlot(slot: number): number {
  if (!Number.isInteger(slot) || slot < ALARM_SLOT_MIN || slot > ALARM_SLOT_MAX) {
    throw new RangeError(`alarm slot must be ${ALARM_SLOT_MIN} to ${ALARM_SLOT_MAX}`);
  }
  return slot;
}

function byteValue(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError(`${name} must be a byte`);
  return value;
}

export function alarmSetBody(slot: number, bandUnixS: number, haptics: AlarmHaptics = BAND_ALARM_HAPTICS): Uint8Array {
  if (!Number.isFinite(bandUnixS) || bandUnixS <= 0 || bandUnixS >= 2 ** 32) throw new RangeError('alarm time must be a positive u32 unix time');
  if (!Number.isInteger(haptics.effectLoops) || haptics.effectLoops < 0 || haptics.effectLoops > 0xffff) throw new RangeError('effect loops must be a u16');
  const out = new Uint8Array(21);
  const view = new DataView(out.buffer);
  const whole = Math.floor(bandUnixS);
  out[0] = ALARM_REVISION;
  out[1] = checkSlot(slot);
  view.setUint32(2, whole, true);
  view.setUint16(6, Math.min(RTC_TICKS_PER_S - 1, Math.floor((bandUnixS - whole) * RTC_TICKS_PER_S)), true);
  out.set(effectSlots(haptics.effects), 8);
  view.setUint16(16, haptics.effectLoops, true);
  out[18] = byteValue(haptics.patternLoops, 'pattern loops');
  out[19] = byteValue(haptics.durationS, 'duration');
  out[20] = 0;
  return out;
}

export function alarmGetBody(slot: number): Uint8Array {
  return Uint8Array.of(ALARM_REVISION, checkSlot(slot));
}

export function alarmRunBody(slot: number): Uint8Array {
  return Uint8Array.of(ALARM_SLOT_REVISION, checkSlot(slot));
}

export function alarmDisableBody(slot: number | 'all'): Uint8Array {
  return Uint8Array.of(ALARM_SLOT_REVISION, slot === 'all' ? ALARM_ALL_SLOTS : checkSlot(slot));
}

export interface AlarmReading {
  active: boolean;
  bandUnixS: number;
}

export function decodeAlarmReading(body: Uint8Array): AlarmReading | null {
  if (body.length < 6 || body[0] !== ALARM_REVISION) return null;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  return { active: body[1] === 1, bandUnixS: view.getUint32(2, true) };
}

export const ALARM_STATUS = [
  'unknown',
  'valid-input-pattern',
  'invalid-waveform-effect',
  'invalid-loop-count',
  'invalid-duration',
  'played-successfully',
  'haptics-failure',
  'haptics-timeout',
  'haptics-busy',
  'haptics-stopped',
  'invalid-alarm-time',
  'invalid-alarm-id',
] as const;

export type AlarmStatus = (typeof ALARM_STATUS)[number] | `code-${number}`;

const REJECTIONS: ReadonlySet<AlarmStatus> = new Set<AlarmStatus>([
  'invalid-waveform-effect',
  'invalid-loop-count',
  'invalid-duration',
  'invalid-alarm-time',
  'invalid-alarm-id',
]);

export function decodeAlarmStatus(body: Uint8Array): AlarmStatus | null {
  const code = body[1];
  if (code === undefined) return null;
  return ALARM_STATUS[code] ?? `code-${code}`;
}

export function isAlarmRejection(status: AlarmStatus | null): boolean {
  return status !== null && REJECTIONS.has(status);
}

export const HAPTICS_TERMINATION = ['expired', 'error', 'stopped'] as const;
export type HapticsTermination = (typeof HAPTICS_TERMINATION)[number] | `code-${number}`;

export function decodeHapticsTermination(payload: Uint8Array): HapticsTermination | null {
  const code = payload[1];
  if (code === undefined) return null;
  return HAPTICS_TERMINATION[code] ?? `code-${code}`;
}

export type Wrist = 'left' | 'right';
export type LabradorOperation = 'stop' | 'start' | 'restart';

const WRIST_CODE: Readonly<Record<Wrist, number>> = { right: 1, left: 2 };
const LABRADOR_OPERATION: Readonly<Record<LabradorOperation, number>> = { stop: 1, start: 2, restart: 3 };

export function wristBody(wrist: Wrist): Uint8Array {
  return Uint8Array.of(REVISION_1, WRIST_CODE[wrist]);
}

export function labradorSwitchBody(on: boolean): Uint8Array {
  return Uint8Array.of(REVISION_1, on ? 1 : 0);
}

export function labradorGenerationBody(operation: LabradorOperation): Uint8Array {
  return Uint8Array.of(REVISION_1, LABRADOR_OPERATION[operation]);
}

const RAW_SESSION_REVISION = 2;
export const RAW_SESSION_MAX_MS = 86_400_000;

export function streamSwitchBody(on: boolean): Uint8Array {
  return Uint8Array.of(REVISION_1, on ? 1 : 0);
}

export function rawSessionBody(durationMs: number): Uint8Array {
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > RAW_SESSION_MAX_MS) {
    throw new RangeError(`raw session duration must be 1 to ${RAW_SESSION_MAX_MS} ms`);
  }
  const out = new Uint8Array(5);
  out[0] = RAW_SESSION_REVISION;
  new DataView(out.buffer).setUint32(1, durationMs, true);
  return out;
}

export function rawStopBody(): Uint8Array {
  return Uint8Array.of(REVISION_1);
}
