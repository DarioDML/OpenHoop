import { ACTIVE_HRR_FRACTION, ALGO, STRESS_WINDOW_S, type ActiveMinutes, type StressDay, type StressWindow } from '@openhoop/analytics';
import type { DayRecord, Derived, SleepPeriodRecord, WorkoutRecord } from '@openhoop/core';

import type { DeviceStatus, DiscoveredBand, LockState, Profile, Settings } from './types';

export const FIXTURE_DAY_COUNT = 40;
const TZ_OFFSET_S = 3600;
const DAY_S = 86400;

const CALIBRATING = new Set([0, 1, 2]);
const LOW_COVERAGE = new Set([12, 25]);
const NO_SLEEP = 18;
const CLOCK_OFFSET = 30;
const MISSING_SPO2 = 22;
const WORKOUT_LABELS = ['Hardlopen', 'Fietsen', 'Krachttraining'];
const FIXTURE_MAX_HR = 183;
const ZONE_HRR_MIDPOINTS = [null, 0.5, 0.65, 0.75, 0.85];
const MEASURED_MINUTES = 1380;
const LOW_COVERAGE_MEASURED_MINUTES = 480;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function derived(value: number, algo: string, coverage: number): Derived {
  return { value, reason: null, coverage, algo };
}

function missing(reason: string, algo: string, coverage: number | null = null): Derived {
  return { value: null, reason, coverage, algo };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function dayString(epochDay: number): string {
  const d = new Date(epochDay * DAY_S * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function buildWorkout(dayStart: number, rand: () => number, index: number): WorkoutRecord {
  const durationS = Math.round((35 + rand() * 40) * 60);
  const start = dayStart + Math.round((17 + rand() * 1.5) * 3600);
  const weights = [0.12, 0.28, 0.3, 0.22, 0.08];
  const manual = index % 3 === 0;
  return {
    start,
    end: start + durationS,
    zoneSeconds: weights.map((w) => Math.round(durationS * w)),
    avgHr: Math.round(128 + rand() * 18),
    maxHr: Math.round(168 + rand() * 14),
    source: manual ? 'manual' : 'auto',
    label: manual ? (WORKOUT_LABELS[index % WORKOUT_LABELS.length] ?? null) : null,
  };
}

function buildActiveMinutes(zoneSeconds: number[], rest: number, lowCoverage: boolean): ActiveMinutes {
  const activeHr = zoneSeconds.flatMap((seconds, z) => {
    const fraction = ZONE_HRR_MIDPOINTS[z] ?? null;
    const minutes = Math.round(seconds / 60);
    return fraction === null || minutes <= 0 ? [] : [{ bpm: Math.round(rest + fraction * (FIXTURE_MAX_HR - rest)), minutes }];
  });
  return {
    totalMinutes: DAY_S / 60,
    measuredMinutes: lowCoverage ? LOW_COVERAGE_MEASURED_MINUTES : MEASURED_MINUTES,
    thresholdBpm: round(rest + ACTIVE_HRR_FRACTION * (FIXTURE_MAX_HR - rest), 1),
    activeHr,
  };
}

const STRESS_FROM_H = 8;
const STRESS_TO_H = 22;
const STRESS_POST_WORKOUT_S = 1800;
const STRESS_MOVING_SHARE = 0.3;

function buildStress(i: number, dayStart: number, workouts: WorkoutRecord[], periods: SleepPeriodRecord[], lowCoverage: boolean, untilS: number): StressDay {
  if (lowCoverage) return { algo: ALGO.stress, reason: 'low-coverage', baselineDays: Math.min(14, i), windows: [] };
  const rand = mulberry32(i * 104729 + 7);
  const calibrating = CALIBRATING.has(i);
  const windows: StressWindow[] = [];
  for (let t = dayStart + STRESS_FROM_H * 3600; t + STRESS_WINDOW_S <= Math.min(dayStart + STRESS_TO_H * 3600, untilS); t += STRESS_WINDOW_S) {
    const end = t + STRESS_WINDOW_S;
    if (workouts.some((w) => t <= w.end + STRESS_POST_WORKOUT_S && end > w.start)) continue;
    if (periods.some((p) => t <= p.offset && end > p.onset)) continue;
    if (rand() < STRESS_MOVING_SHARE) continue;
    const hour = (t - dayStart) / 3600;
    const workBump = hour >= 9.5 && hour < 12 ? 0.9 + 0.3 * Math.sin(i) : 0;
    const raw = 0.45 + 0.35 * Math.sin((hour + i) / 2.3) + workBump + (rand() - 0.5) * 0.9;
    const score = clamp(round(raw, 1), 0, 3);
    windows.push({
      t,
      hr: round(66 + score * 6 + (rand() - 0.5) * 4, 1),
      rmssd: rand() < 0.4 ? null : round(Math.max(8, 42 - score * 9 + (rand() - 0.5) * 8), 1),
      score: calibrating ? null : score,
    });
  }
  return { algo: ALGO.stress, reason: calibrating ? 'needs-history' : null, baselineDays: calibrating ? 0 : Math.min(14, i), windows };
}

interface SleepPart {
  periods: SleepPeriodRecord[];
  asleepS: number;
  inBedS: number;
}

function buildSleep(dayStart: number, rand: () => number): SleepPart {
  const onset = dayStart - 3600 + Math.round((rand() - 0.4) * 5400);
  const inBedMain = Math.round((7.4 + rand() * 1.1) * 3600);
  const asleepMain = Math.round(inBedMain * (0.88 + rand() * 0.07));
  const periods: SleepPeriodRecord[] = [
    { onset, offset: onset + inBedMain, asleepS: asleepMain, inBedS: inBedMain, nap: false },
  ];
  if (rand() > 0.8) {
    const napOnset = dayStart + Math.round((14 + rand() * 1.5) * 3600);
    const napLen = Math.round((20 + rand() * 25) * 60);
    periods.push({ onset: napOnset, offset: napOnset + napLen, asleepS: Math.round(napLen * 0.85), inBedS: napLen, nap: true });
  }
  return { periods, asleepS: asleepMain, inBedS: inBedMain };
}

function buildDay(i: number, epochDay: number, deviceId: number, untilS: number): DayRecord {
  const rand = mulberry32(i * 7919 + 13);
  const noise = (amp: number): number => (rand() - 0.5) * 2 * amp;
  const start = epochDay * DAY_S - TZ_OFFSET_S;
  const lowCoverage = LOW_COVERAGE.has(i);
  const noSleep = i === NO_SLEEP;

  const sleepPart = noSleep ? null : buildSleep(start, rand);
  const asleepH = sleepPart ? sleepPart.asleepS / 3600 : 0;

  const hrvRaw = 52 + 9 * Math.sin(i / 5) + noise(5);
  const rhrRaw = 55 + 3 * Math.cos(i / 6) + noise(1.5);
  const respRaw = 14.3 + noise(0.7);
  const spo2Raw = 96.6 + noise(0.9);
  const tempRaw = 33.4 + noise(0.4) + (i === 33 ? 0.6 : 0);

  const workouts: WorkoutRecord[] = i % 5 === 4 || i % 7 === 0 ? [buildWorkout(start, rand, i)] : [];
  const baseZones = [
    Math.round(5400 + noise(1200)),
    Math.round(2700 + noise(600)),
    Math.round(900 + noise(300)),
    Math.round(200 + noise(100)),
    0,
  ];
  const zoneSeconds = baseZones.map((s, z) => s + workouts.reduce((sum, w) => sum + (w.zoneSeconds[z] ?? 0), 0));
  const zh = (z: number): number => (zoneSeconds[z] ?? 0) / 3600;
  const loadRaw = clamp(zh(1) * 2.2 + zh(2) * 6 + zh(3) * 11 + zh(4) * 16 + 1.2, 0, 21);

  const sleepScoreRaw = sleepPart ? clamp(Math.round((asleepH / 8.2) * 82 + 10 + noise(5)), 20, 99) : 0;
  const needS = Math.round((8.1 + (workouts.length > 0 ? 0.25 : 0)) * 3600);
  const debtS = sleepPart ? Math.max(0, needS - sleepPart.asleepS) : 0;

  const hrvOk = !lowCoverage && !noSleep;
  const contributions = {
    hrv: round((hrvRaw - 52) * 0.9, 1),
    sleep: round((sleepScoreRaw - 75) * 0.3, 1),
    rhr: round((55 - rhrRaw) * 1.4, 1),
  };
  const readinessRaw = clamp(Math.round(62 + contributions.hrv + contributions.sleep + contributions.rhr), 1, 99);

  const nightReason = noSleep ? 'no-sleep' : 'low-coverage';
  const nightCoverage = noSleep ? null : 0.12;
  const hrv = hrvOk ? derived(round(hrvRaw, 1), 'rmssd@1', round(0.88 + rand() * 0.1, 2)) : missing(nightReason, 'rmssd@1', nightCoverage);
  const restingHr = noSleep ? missing('no-sleep', 'rhr@1') : derived(Math.round(rhrRaw), 'rhr@1', round(0.9 + rand() * 0.08, 2));
  const readiness = hrvOk
    ? derived(readinessRaw, 'readiness-rec-rhr@1', hrv.coverage ?? 1)
    : missing(nightReason, 'readiness-rec-rhr@1', nightCoverage);

  return {
    deviceId,
    day: dayString(epochDay),
    start,
    end: start + DAY_S,
    tzOffsetS: TZ_OFFSET_S,
    flags: i === CLOCK_OFFSET ? ['clock-offset'] : [],
    sleep: {
      periods: sleepPart?.periods ?? [],
      asleepS: sleepPart?.asleepS ?? null,
      inBedS: sleepPart?.inBedS ?? null,
      need: i === 0 ? missing('needs-history', 'sleep-need@1') : derived(needS, 'sleep-need@1', 1),
      debt: i < 2 ? missing('needs-history', 'sleep-debt@1') : derived(debtS, 'sleep-debt@1', 1),
      consistency:
        i < 3 || noSleep
          ? missing(noSleep ? 'no-sleep' : 'needs-history', 'sleep-consistency@1')
          : derived(Math.round(78 + noise(12)), 'sleep-consistency@1', 1),
      score: sleepPart ? derived(sleepScoreRaw, 'sleep-score@1', 0.95) : missing('no-sleep', 'sleep-score@1'),
    },
    hrv,
    restingHr,
    respiratoryRate: hrvOk ? derived(round(respRaw, 1), 'resp-rr@1', 0.85) : missing(nightReason, 'resp-rr@1', nightCoverage),
    spo2:
      i === MISSING_SPO2 || noSleep
        ? missing(noSleep ? 'no-sleep' : 'missing-signal', 'spo2@1')
        : derived(round(spo2Raw, 1), 'spo2@1', 0.9),
    skinTempC: noSleep ? missing('no-sleep', 'skin-temp@1') : derived(round(tempRaw, 2), 'skin-temp@1', 0.93),
    skinTempDeviationC:
      noSleep || i < 3
        ? missing(noSleep ? 'no-sleep' : 'needs-history', 'skin-temp-dev@1')
        : derived(round(tempRaw - 33.4, 2), 'skin-temp-dev@1', 0.93),
    readiness,
    readinessCalibrating: CALIBRATING.has(i),
    readinessContributions: hrvOk ? contributions : null,
    load: derived(round(loadRaw, 1), 'load-hrr@1', 0.97),
    zoneSeconds,
    steps: Math.round(8200 + 3800 * Math.sin(i / 3) + noise(1500)),
    heartRate: {
      min: Math.round(rhrRaw - 4),
      avg: Math.round(70 + noise(5)),
      max: workouts[0]?.maxHr ?? Math.round(118 + noise(10)),
    },
    workouts,
    activeMinutes: buildActiveMinutes(zoneSeconds, rhrRaw, lowCoverage),
    stress: buildStress(i, start, workouts, sleepPart?.periods ?? [], lowCoverage, untilS),
  };
}

export function createFixtureDays(now: Date = new Date(), deviceId = 1): DayRecord[] {
  const todayEpochDay = Math.floor((now.getTime() / 1000 + TZ_OFFSET_S) / DAY_S);
  const nowS = Math.floor(now.getTime() / 1000);
  return Array.from({ length: FIXTURE_DAY_COUNT }, (_, i) => buildDay(i, todayEpochDay - (FIXTURE_DAY_COUNT - 1 - i), deviceId, nowS));
}

export function createFixtureDevice(now: Date = new Date(), lockState: LockState = 'open'): DeviceStatus {
  return {
    name: 'Demoband',
    model: '5.0',
    firmware: '50.36.2.0',
    batteryPercent: 72,
    lastSyncAt: Math.floor(now.getTime() / 1000) - 18 * 60,
    backlogPages: 0,
    lockState,
    connection: 'connected',
  };
}

export const FIXTURE_PROFILE: Profile = { birthYear: 1990, maxHeartRate: null };

export function createFixtureSettings(language: Settings['language'], now: Date = new Date()): Settings {
  const first = createFixtureDays(now)[0];
  return { language, dataSource: 'demo', ownerSince: first?.day ?? null };
}

export const FIXTURE_BANDS: DiscoveredBand[] = [
  { id: 'demo-band-1', name: 'WHOOP 5.0 (demo)', rssi: -52 },
  { id: 'demo-band-2', name: 'WHOOP MG (demo)', rssi: -71 },
];
