import type { BandState } from '@openhoop/protocol';

export interface SimSecond {
  heartRate: number;
  rrMs: number[];
  stepCounter: number;
  skinTempC: number;
  spo2Byte82: number;
  bandState: BandState;
  dynamicAccelG: number;
}

const TZ_S = 3600;
const DAY_S = 86400;
const BLOCK_S = 600;
const BLOCKS_PER_DAY = DAY_S / BLOCK_S;
const SPO2_PERIOD_S = 1200;
const SPO2_OFFSET_S = 337;
const SPO2_WINDOW_S = 30;
const SPO2_STATUS_CODES: readonly number[] = [16, 32, 128, 160];
const STEPS_PER_DAY = 9000;
const STEPS_SPREAD = 2000;
const UP_S = 600;

const SALT = {
  onset: 1,
  wake: 2,
  workout: 3,
  workoutStart: 4,
  workoutLength: 5,
  workoutHr: 6,
  breath: 7,
  rsaAmp: 8,
  phase: 9,
  nightHr: 10,
  hrNoise: 11,
  hrJitter: 12,
  dayHrNoise: 13,
  moment: 14,
  momentKind: 15,
  dayState: 16,
  walk: 17,
  walkWeight: 18,
  dropoutOn: 19,
  dropoutStart: 20,
  dropoutLength: 21,
  beatCount: 22,
  beatNoise: 23,
  dayRr: 24,
  spo2Base: 25,
  spo2Jitter: 26,
  spo2Status: 27,
  spo2Code: 28,
  tempNoise: 29,
  tempDay: 30,
  stepBase: 31,
  accel: 32,
  workoutHrNoise: 33,
} as const;

function mix(input: number): number {
  let h = input >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hash(seed: number, a: number, salt: number, b = 0): number {
  let h = mix((seed | 0) ^ 0x9e3779b9);
  h = mix(h ^ Math.imul(a | 0, 0x85ebca6b));
  h = mix(h ^ Math.imul(b | 0, 0xc2b2ae35));
  return mix(h ^ Math.imul(salt, 0x27d4eb2f));
}

function unit(seed: number, a: number, salt: number, b = 0): number {
  return hash(seed, a, salt, b) / 4294967296;
}

function smooth(seed: number, salt: number, t: number, period: number): number {
  const x = t / period;
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = unit(seed, i, salt);
  const b = unit(seed, i + 1, salt);
  return (a + (b - a) * s) * 2 - 1;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function localDay(t: number): number {
  return Math.floor((t + TZ_S) / DAY_S);
}

interface NightWindow {
  key: number;
  onset: number;
  wake: number;
}

function nightWindow(seed: number, d: number): NightWindow {
  const onsetLocal = d * DAY_S + 23 * 3600 + 15 * 60 + Math.round((unit(seed, d, SALT.onset) - 0.5) * 80 * 60);
  const wakeLocal = (d + 1) * DAY_S + 7 * 3600 + Math.round((unit(seed, d, SALT.wake) - 0.5) * 60 * 60);
  return { key: d, onset: onsetLocal - TZ_S, wake: wakeLocal - TZ_S };
}

interface Workout {
  start: number;
  end: number;
  hr: number;
}

function workoutFor(seed: number, d: number): Workout | null {
  if (unit(seed, d, SALT.workout) >= 5 / 7) return null;
  const startLocal = d * DAY_S + 17 * 3600 + Math.floor(unit(seed, d, SALT.workoutStart) * 2 * 3600);
  const minutes = 30 + Math.floor(unit(seed, d, SALT.workoutLength) * 31);
  const start = startLocal - TZ_S;
  return { start, end: start + minutes * 60, hr: 130 + Math.floor(unit(seed, d, SALT.workoutHr) * 36) };
}

function isWalkingBlock(seed: number, d: number, block: number): boolean {
  const startS = block * BLOCK_S;
  if (startS < 8 * 3600 || startS >= 22 * 3600) return false;
  return unit(seed, d * BLOCKS_PER_DAY + block, SALT.walk) < 0.28;
}

function blockWeight(seed: number, d: number, block: number, workout: Workout | null): number {
  const mid = d * DAY_S - TZ_S + block * BLOCK_S + BLOCK_S / 2;
  if (workout !== null && mid >= workout.start && mid < workout.end) return 4;
  if (!isWalkingBlock(seed, d, block)) return 0;
  return 0.6 + unit(seed, d * BLOCKS_PER_DAY + block, SALT.walkWeight);
}

interface DaySteps {
  prefix: Float64Array;
}

const stepCache = new Map<number, { day: number; steps: DaySteps }>();

function daySteps(seed: number, d: number): DaySteps {
  const cached = stepCache.get(seed);
  if (cached !== undefined && cached.day === d) return cached.steps;
  const workout = workoutFor(seed, d);
  const prefix = new Float64Array(BLOCKS_PER_DAY + 1);
  for (let b = 0; b < BLOCKS_PER_DAY; b++) prefix[b + 1] = (prefix[b] ?? 0) + blockWeight(seed, d, b, workout);
  const steps = { prefix };
  stepCache.set(seed, { day: d, steps });
  return steps;
}

function midnightSteps(seed: number, d: number): number {
  return d * STEPS_PER_DAY + unit(seed, d, SALT.stepBase) * STEPS_SPREAD;
}

function stepCounterAt(seed: number, d: number, localSec: number): number {
  const { prefix } = daySteps(seed, d);
  const total = prefix[BLOCKS_PER_DAY] ?? 0;
  const block = Math.min(BLOCKS_PER_DAY - 1, Math.floor(localSec / BLOCK_S));
  const base = prefix[block] ?? 0;
  const next = prefix[block + 1] ?? base;
  const within = base + ((next - base) * (localSec - block * BLOCK_S)) / BLOCK_S;
  const fraction = total > 0 ? within / total : 0;
  const from = midnightSteps(seed, d);
  const to = midnightSteps(seed, d + 1);
  return Math.floor(from + (to - from) * fraction) & 0xffff;
}

function inDropout(seed: number, t: number): boolean {
  const w = Math.floor(t / 1800);
  for (const k of [w - 1, w]) {
    if (unit(seed, k, SALT.dropoutOn) >= 0.35) continue;
    const start = k * 1800 + Math.floor(unit(seed, k, SALT.dropoutStart) * 1500);
    const length = 120 + Math.floor(unit(seed, k, SALT.dropoutLength) * 480);
    if (t >= start && t < start + length) return true;
  }
  return false;
}

function gauss(seed: number, a: number, salt: number, b: number): number {
  return (unit(seed, a, salt, b) + unit(seed, a, salt + 100, b) + unit(seed, a, salt + 200, b) - 1.5) * 2;
}

function beatIntervals(
  seed: number,
  t: number,
  hr: number,
  mode: { amplitude: number; breathHz: number; phase: number; noiseMs: number },
): number[] {
  const x = hr / 60;
  const whole = Math.floor(x);
  const n = whole + (unit(seed, t, SALT.beatCount) < x - whole ? 1 : 0);
  const out: number[] = [];
  const base = 60000 / hr;
  for (let j = 0; j < n; j++) {
    const tb = t + (j + 0.5) / n;
    const rsa = mode.amplitude * Math.sin(2 * Math.PI * mode.breathHz * tb + mode.phase);
    const noise = mode.noiseMs * gauss(seed, t, SALT.beatNoise, j);
    out.push(Math.round(clamp(base + rsa + noise, 320, 1900)));
  }
  return out;
}

export function simulateSecond(seed: number, unixS: number): SimSecond {
  const t = Math.floor(unixS);
  const d = localDay(t);
  const localSec = t + TZ_S - d * DAY_S;
  const block = Math.floor(localSec / BLOCK_S);

  let night: NightWindow | null = null;
  let sinceWake = Number.POSITIVE_INFINITY;
  for (const k of [d - 1, d]) {
    const w = nightWindow(seed, k);
    if (t >= w.onset && t < w.wake) night = w;
    else if (t >= w.wake) sinceWake = Math.min(sinceWake, t - w.wake);
  }

  const workout = workoutFor(seed, d);
  const exercising = night === null && workout !== null && t >= workout.start && t < workout.end;
  const walking = night === null && !exercising && isWalkingBlock(seed, d, block);

  let bandState: BandState;
  if (night !== null) {
    bandState = 'SLEEP';
    if (unit(seed, Math.floor(t / 20), SALT.moment) < 0.015) {
      bandState = unit(seed, Math.floor(t / 20), SALT.momentKind) < 0.5 ? 'WAKE' : 'STILL';
    }
  } else if (sinceWake < UP_S) {
    bandState = 'UP';
  } else if (exercising || walking) {
    bandState = 'WAKE';
  } else {
    bandState = unit(seed, Math.floor(t / 60), SALT.dayState) < 0.6 ? 'STILL' : 'WAKE';
  }

  let hr: number;
  if (night !== null) {
    const p = (t - night.onset) / (night.wake - night.onset);
    hr =
      57 -
      7 * Math.sin(Math.PI * p) +
      (unit(seed, night.key, SALT.nightHr) * 2 - 1) +
      1.2 * smooth(seed, SALT.hrNoise, t, 45) +
      0.7 * (unit(seed, t, SALT.hrJitter) * 2 - 1);
    hr = clamp(hr, 46, 60);
  } else {
    hr =
      72 +
      7 * Math.sin((2 * Math.PI * (localSec - 9 * 3600)) / DAY_S) +
      4 * smooth(seed, SALT.dayHrNoise, t, 60) +
      (unit(seed, t, SALT.hrJitter) * 2 - 1);
    if (walking) hr += 11;
    if (sinceWake < 1800) hr += 8 * (1 - sinceWake / 1800);
    hr = clamp(hr, 60, 95);
    if (workout !== null) {
      const ramp = clamp(Math.min(t - workout.start, workout.end - t) / 300, 0, 1);
      if (exercising || ramp > 0) {
        const target = workout.hr + 5 * smooth(seed, SALT.workoutHrNoise, t, 20);
        hr = clamp(hr + (target - hr) * ramp, 60, 175);
      }
    }
  }
  const heartRate = Math.round(hr);

  let rrMs: number[] = [];
  if (night !== null) {
    if (!inDropout(seed, t)) {
      const breathHz = (14 + (unit(seed, night.key, SALT.breath) - 0.5)) / 60;
      rrMs = beatIntervals(seed, t, heartRate, {
        amplitude: 38 + 20 * unit(seed, night.key, SALT.rsaAmp),
        breathHz,
        phase: unit(seed, night.key, SALT.phase) * 2 * Math.PI,
        noiseMs: 18,
      });
    }
  } else if (!exercising && unit(seed, Math.floor(t / 30), SALT.dayRr) < 0.1) {
    rrMs = beatIntervals(seed, t, heartRate, { amplitude: 8, breathHz: 0.25, phase: 0, noiseMs: 25 });
  }

  let skin: number;
  if (night !== null) {
    const p = (t - night.onset) / (night.wake - night.onset);
    skin = 32 + 2.5 * Math.min(1, Math.max(0, p)) ** 0.8;
  } else {
    const daily = 32.6 + 0.5 * Math.sin((2 * Math.PI * (localSec - 12 * 3600)) / DAY_S);
    skin = sinceWake < 7200 ? daily + (34.5 - daily) * Math.exp(-sinceWake / 1800) : daily;
  }
  skin += 0.06 * smooth(seed, SALT.tempNoise, t, 120);
  const skinTempC = Math.round(skin * 100) / 100;

  let spo2Byte82 = 0;
  if (night !== null) {
    const shifted = t - SPO2_OFFSET_S;
    const offset = ((shifted % SPO2_PERIOD_S) + SPO2_PERIOD_S) % SPO2_PERIOD_S;
    if (offset < SPO2_WINDOW_S) {
      const window = Math.floor(shifted / SPO2_PERIOD_S);
      if (unit(seed, t, SALT.spo2Status) < 0.12) {
        spo2Byte82 = SPO2_STATUS_CODES[Math.floor(unit(seed, t, SALT.spo2Code) * SPO2_STATUS_CODES.length)] ?? 16;
      } else {
        const base = 94 + Math.floor(unit(seed, window, SALT.spo2Base) * 6);
        spo2Byte82 = base + Math.round((unit(seed, t, SALT.spo2Jitter) - 0.5) * 2);
      }
    }
  }

  let dynamicAccelG: number;
  const jitter = unit(seed, t, SALT.accel);
  if (night !== null) {
    dynamicAccelG = bandState === 'SLEEP' ? 0.004 + 0.006 * jitter : 0.12 + 0.1 * jitter;
  } else if (bandState === 'UP') {
    dynamicAccelG = 0.5 + 0.3 * jitter;
  } else if (exercising) {
    dynamicAccelG = 0.7 + 0.4 * jitter;
  } else if (walking) {
    dynamicAccelG = 0.25 + 0.2 * jitter;
  } else {
    dynamicAccelG = 0.03 + 0.04 * jitter;
  }

  return {
    heartRate,
    rrMs,
    stepCounter: stepCounterAt(seed, d, localSec),
    skinTempC,
    spo2Byte82,
    bandState,
    dynamicAccelG: Math.round(dynamicAccelG * 1000) / 1000,
  };
}
