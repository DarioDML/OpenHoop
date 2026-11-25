import { decodeFrame, encodeBiometric } from '@openhoop/protocol';
import { sampleFromPacket } from '../src/mapping';
import type { SampleRow } from '../src/store/types';

export const TZ_S = 3_600;
const FIRST_UTC_MIDNIGHT_S = Date.UTC(2026, 2, 2) / 1000;
const DAY_S = 86_400;
const HOUR_S = 3_600;
const STEP_START = 65_000;

export function localMidnight(dayIndex: number): number {
  return FIRST_UTC_MIDNIGHT_S - TZ_S + dayIndex * DAY_S;
}

export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function base(deviceId: number, t: number): SampleRow {
  return {
    deviceId,
    t,
    source: 'history',
    hr: null,
    rr: [],
    steps: null,
    skinTempC: null,
    spo2Raw: null,
    state: null,
    motionG: null,
    chunkId: null,
  };
}

export interface NightOptions {
  seed?: number;
  rrKeep?: number;
  tempC?: number;
}

export function nightSamples(deviceId: number, start: number, seconds: number, opts: NightOptions = {}): SampleRow[] {
  const rand = lcg(opts.seed ?? 1);
  const keep = opts.rrKeep ?? 1;
  const rr: number[][] = Array.from({ length: seconds }, () => []);
  let beatTime = 0;
  for (;;) {
    const ms = Math.round(1154 + 45 * Math.sin(2 * Math.PI * 0.25 * beatTime) + (rand() - 0.5) * 16);
    beatTime += ms / 1000;
    const sec = Math.floor(beatTime);
    if (sec >= seconds) break;
    if (keep >= 1 || rand() < keep) rr[sec]?.push(ms);
  }
  const tempC = opts.tempC ?? 33.4;
  return rr.map((beats, i) => ({
    ...base(deviceId, start + i),
    hr: 52 + (Math.floor(i / 40) % 3) - 1,
    rr: beats,
    skinTempC: tempC + 0.1 * Math.sin(i / 900),
    spo2Raw: i % 1_200 < 10 ? 96 + (Math.floor(i / 1_200) % 3) : null,
    state: 'SLEEP',
    motionG: 0.01,
  }));
}

export interface AwakeOptions {
  workout?: { offsetS: number; durationS: number; hr: number };
  nap?: { offsetS: number; durationS: number };
}

export function awakeSamples(
  deviceId: number,
  start: number,
  seconds: number,
  opts: AwakeOptions = {},
  stepStart = STEP_START,
): SampleRow[] {
  const out: SampleRow[] = [];
  let counter = stepStart;
  for (let i = 0; i < seconds; i++) {
    const inWorkout = opts.workout !== undefined && i >= opts.workout.offsetS && i < opts.workout.offsetS + opts.workout.durationS;
    const inNap = opts.nap !== undefined && i >= opts.nap.offsetS && i < opts.nap.offsetS + opts.nap.durationS;
    if (!inNap && i % 2 === 1) counter = (counter + 1) % 65_536;
    const hr = inNap
      ? 56
      : inWorkout && opts.workout !== undefined
        ? opts.workout.hr + (Math.floor(i / 30) % 3) - 1
        : 65 + Math.round(12 * (1 + Math.sin((2 * Math.PI * i) / 5_400)));
    out.push({
      ...base(deviceId, start + i),
      hr,
      steps: counter,
      skinTempC: 32.8,
      state: inNap ? 'SLEEP' : 'WAKE',
      motionG: inNap ? 0.01 : 0.1,
    });
  }
  return out;
}

export interface SimulationOptions {
  days: number;
  noNightDays?: number[];
  rrKeepByDay?: Record<number, number>;
  workoutDays?: number[];
  napDays?: number[];
}

export function simulateDays(deviceId: number, opts: SimulationOptions): SampleRow[] {
  const out: SampleRow[] = [];
  let counter = STEP_START;
  for (let d = 0; d < opts.days; d++) {
    const midnight = localMidnight(d);
    const nightStart = midnight - HOUR_S;
    const nightLength = 8 * HOUR_S;
    if (opts.noNightDays?.includes(d) === true) {
      const sleepless = awakeSamples(deviceId, nightStart, nightLength, {}, counter);
      counter = sleepless[sleepless.length - 1]?.steps ?? counter;
      out.push(...sleepless);
    } else {
      out.push(
        ...nightSamples(deviceId, nightStart, nightLength, {
          seed: 100 + d,
          rrKeep: opts.rrKeepByDay?.[d] ?? 1,
          tempC: 33.4 + 0.05 * (d % 3),
        }),
      );
    }
    const awakeStart = nightStart + nightLength;
    const awake = awakeSamples(
      deviceId,
      awakeStart,
      16 * HOUR_S,
      {
        workout: opts.workoutDays?.includes(d) === true ? { offsetS: 10 * HOUR_S, durationS: 2_400, hr: 150 } : undefined,
        nap: opts.napDays?.includes(d) === true ? { offsetS: 7 * HOUR_S, durationS: 2_700 } : undefined,
      },
      counter,
    );
    counter = awake[awake.length - 1]?.steps ?? counter;
    out.push(...awake);
  }
  return out;
}

export function toFrame(row: SampleRow, recordIndex: number): Uint8Array {
  return encodeBiometric({
    recordIndex,
    unixS: row.t,
    packetType: 47,
    heartRate: row.hr ?? 0,
    rrMs: row.rr,
    stepCounter: row.steps ?? 0,
    skinTempC: row.skinTempC ?? 0,
    spo2Byte82: row.spo2Raw ?? 0,
    bandState: row.state ?? 'WAKE',
    dynamicAccelG: row.motionG ?? 0,
  });
}

export function decodeRow(deviceId: number, frame: Uint8Array): SampleRow | null {
  const row = sampleFromPacket(deviceId, decodeFrame(frame));
  return row === null ? null : { ...row, source: 'history' };
}
