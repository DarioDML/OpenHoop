import { isValidHr, lowerBound, median, sortedUnique } from './series';
import type { Night, Sample, SleepPeriod } from './types';

export const SLEEP_SMOOTH_S = 300;
export const SLEEP_MAX_GAP_S = 600;
export const SLEEP_MIN_DURATION_S = 1200;
export const NIGHT_MERGE_GAP_S = 7200;
export const SLEEP_MAX_HR = 100;
export const SLEEP_MIN_SKIN_TEMP_SHARE = 0.5;
export const WAKE_CALM_MINUTES = 5;
export const RESTLESS_MOTION_RATIO = 3;
export const RESTLESS_MOTION_FLOOR_G = 0.015;
export const RESTLESS_MIN_S = 3;
export const AWAKE_HR_RISE = 8;
export const AWAKE_MIN_HR_RISE = 5;
export const AWAKE_HR_MINUTES = 3;
export const STILL_LEAD_IN_MAX_S = 3600;
export const BED_LEAD_IN_MAX_S = 3600;
const MINUTE_S = 60;
const MINUTE_MIN_HR_S = 10;

// An MG band (50.43.2.0) worn before it was set up flagged a whole afternoon, a 178 bpm run included, as SLEEP.
export function isAsleepSample(sample: Sample | undefined): boolean {
  if (sample?.state !== 'SLEEP') return false;
  return !(isValidHr(sample.hr) && sample.hr > SLEEP_MAX_HR);
}

export function sleepPeriods(samples: Sample[]): SleepPeriod[] {
  const rows = sortedUnique(samples);
  const n = rows.length;
  // The same pre-setup afternoon read 5-13 C while its wear detector (event 120) said worn, so its skin temperature was
  // rejected; a SLEEP stretch without skin temperature, from a band that reports it elsewhere, is not trusted as sleep.
  const reportsSkinTemp = rows.some((r) => r.skinTempC !== null);
  const half = SLEEP_SMOOTH_S / 2;
  const prefix = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = (prefix[i] ?? 0) + (isAsleepSample(rows[i]) ? 1 : 0);

  const spans: [number, number][] = [];
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const t = rows[i]?.t ?? 0;
    while ((rows[lo]?.t ?? Infinity) < t - half) lo++;
    while (hi < n && (rows[hi]?.t ?? Infinity) <= t + half) hi++;
    const asleep = 2 * ((prefix[hi] ?? 0) - (prefix[lo] ?? 0)) > hi - lo;
    if (!asleep) continue;
    const last = spans[spans.length - 1];
    if (last !== undefined && t - last[1] <= SLEEP_MAX_GAP_S) last[1] = t;
    else spans.push([t, t]);
  }

  const out: SleepPeriod[] = [];
  let k = 0;
  for (const [start, end] of spans) {
    if (end - start + 1 < SLEEP_MIN_DURATION_S) continue;
    while (k < n && (rows[k]?.t ?? Infinity) < start) k++;
    const span = summarize(rows, k, start, end);
    k = span.next;
    if (reportsSkinTemp && span.warmSeconds < SLEEP_MIN_SKIN_TEMP_SHARE * span.seconds) continue;
    out.push(span.period);
  }
  return out;
}

interface Summary {
  period: SleepPeriod;
  seconds: number;
  warmSeconds: number;
  next: number;
}

function summarize(rows: readonly Sample[], from: number, start: number, end: number): Summary {
  let asleepS = 0;
  let hrMin: number | null = null;
  let hrSum = 0;
  let hrCount = 0;
  let seconds = 0;
  let warmSeconds = 0;
  let j = from;
  for (; j < rows.length; j++) {
    const r = rows[j];
    if (r === undefined || r.t > end) break;
    seconds++;
    if (r.skinTempC !== null) warmSeconds++;
    if (isAsleepSample(r)) asleepS++;
    if (isValidHr(r.hr)) {
      hrMin = hrMin === null ? r.hr : Math.min(hrMin, r.hr);
      hrSum += r.hr;
      hrCount++;
    }
  }
  const period = { onset: start, offset: end, asleepS, inBedS: end - start + 1, hrMin, hrMean: hrCount > 0 ? hrSum / hrCount : null };
  return { period, seconds, warmSeconds, next: j };
}

function heldHr(minuteHr: readonly number[], k: number): number {
  let sum = 0;
  let count = 0;
  for (let j = k; j > k - AWAKE_HR_MINUTES && j >= 0; j--) {
    const v = minuteHr[j] ?? Number.NaN;
    if (Number.isNaN(v)) continue;
    sum += v;
    count++;
  }
  return count > 0 ? sum / count : Number.NaN;
}

interface MinuteStats {
  restless: Int32Array;
  hr: number[];
}

function restlessThreshold(rows: readonly Sample[], from: number, to: number): number {
  const motion: number[] = [];
  for (let i = from; i < to; i++) {
    const m = rows[i]?.motionG;
    if (m !== null && m !== undefined && Number.isFinite(m) && m >= 0) motion.push(m);
  }
  const motionMedian = median(motion);
  return motionMedian === null ? Infinity : Math.max(RESTLESS_MOTION_RATIO * motionMedian, RESTLESS_MOTION_FLOOR_G);
}

function minuteStats(rows: readonly Sample[], from: number, to: number, minutes: number, minuteOf: (t: number) => number, restlessG: number): MinuteStats {
  const restless = new Int32Array(minutes);
  const hrSum = new Float64Array(minutes);
  const hrCount = new Int32Array(minutes);
  for (let i = from; i < to; i++) {
    const r = rows[i];
    if (r === undefined) continue;
    const k = minuteOf(r.t);
    if (k < 0 || k >= minutes) continue;
    if (r.motionG !== null && r.motionG > restlessG) restless[k] = (restless[k] ?? 0) + 1;
    if (isValidHr(r.hr)) {
      hrSum[k] = (hrSum[k] ?? 0) + r.hr;
      hrCount[k] = (hrCount[k] ?? 0) + 1;
    }
  }
  const hr = Array.from(hrSum, (sum, k) => ((hrCount[k] ?? 0) >= MINUTE_MIN_HR_S ? sum / (hrCount[k] ?? 1) : Number.NaN));
  return { restless, hr };
}

function wakeAt(rows: readonly Sample[], period: SleepPeriod): number {
  const from = lowerBound(rows, period.onset);
  const to = lowerBound(rows, period.offset + 1);
  const restlessG = restlessThreshold(rows, from, to);
  const minutes = Math.floor((period.offset - period.onset) / MINUTE_S) + 1;
  const { restless, hr: minuteHr } = minuteStats(rows, from, to, minutes, (t) => Math.floor((period.offset - t) / MINUTE_S), restlessG);
  const sleepingHr = median(minuteHr.filter((v) => !Number.isNaN(v)));
  let wake = period.offset + 1;
  let calm = 0;
  for (let k = 0; k < minutes && calm < WAKE_CALM_MINUTES; k++) {
    const own = sleepingHr === null ? Number.NaN : (minuteHr[k] ?? Number.NaN) - sleepingHr;
    const held = sleepingHr === null ? Number.NaN : heldHr(minuteHr, k) - sleepingHr;
    const raised = held >= AWAKE_HR_RISE || ((restless[k] ?? 0) >= RESTLESS_MIN_S && held >= AWAKE_MIN_HR_RISE);
    const awake = own >= AWAKE_MIN_HR_RISE && raised;
    if (awake) {
      calm = 0;
      wake = Math.max(period.onset, period.offset - (k + 1) * MINUTE_S + 1);
    } else {
      calm++;
    }
  }
  return wake;
}

// The MG band (50.43.2.0) keeps flagging SLEEP while its wearer lies awake in bed and only switches once they get up,
// so a night synced before that ended at the newest sample. Walking back from the end of each period, a minute is awake
// when its heart rate is raised above the period's sleeping rate and stays raised over the next two minutes (by less
// when the wrist moves), and five calm minutes are sleep. A turn in sleep raises the rate only for its own minute.
// The period then ends at the wake-up, while its time in bed still runs until the band saw the wearer get up.
export function withoutAwakeTails(periods: readonly SleepPeriod[], samples: readonly Sample[]): SleepPeriod[] {
  if (periods.length === 0) return [];
  const rows = sortedUnique(samples);
  const out: SleepPeriod[] = [];
  for (const period of periods) {
    const wake = wakeAt(rows, period);
    if (wake > period.offset) {
      out.push(period);
      continue;
    }
    if (wake - period.onset < SLEEP_MIN_DURATION_S) continue;
    const trimmed = summarize(rows, lowerBound(rows, period.onset), period.onset, wake - 1).period;
    out.push({ ...trimmed, inBedS: period.inBedS, bedOffset: period.bedOffset ?? period.offset });
  }
  return out;
}

export function groupNights<P extends SleepPeriod>(periods: P[]): Night<P>[] {
  const sorted = periods.slice().sort((a, b) => a.onset - b.onset);
  const groups: P[][] = [];
  for (const p of sorted) {
    const group = groups[groups.length - 1];
    const prev = group?.[group.length - 1];
    if (group !== undefined && prev !== undefined && p.onset - prev.offset < NIGHT_MERGE_GAP_S) group.push(p);
    else groups.push([p]);
  }
  const nights: Night<P>[] = [];
  for (const g of groups) {
    const first = g[0];
    const last = g[g.length - 1];
    if (first === undefined || last === undefined) continue;
    let asleepS = 0;
    let inBedS = 0;
    for (const p of g) {
      asleepS += p.asleepS;
      inBedS += p.inBedS;
    }
    nights.push({ periods: g, onset: first.onset, offset: last.offset, asleepS, inBedS });
  }
  return nights;
}

function stillSince(rows: readonly Sample[], onset: number, after: number, reportsSkinTemp: boolean): number {
  let start = onset;
  for (let i = lowerBound(rows, onset) - 1; i >= 0; i--) {
    const r = rows[i];
    if (r === undefined || r.t <= after || r.state !== 'STILL' || onset - r.t > STILL_LEAD_IN_MAX_S || start - r.t > MINUTE_S) break;
    if (reportsSkinTemp && r.skinTempC === null) break;
    start = r.t;
  }
  return start;
}

// The band only flags SLEEP after the wearer has lain still for about ten minutes, and calls that stretch STILL. It is
// time in bed; from the end of its last restless or raised-heart-rate minute it is sleep the band has not flagged yet.
export function withStillLeadIn(periods: readonly SleepPeriod[], samples: readonly Sample[]): SleepPeriod[] {
  if (periods.length === 0) return [];
  const rows = sortedUnique(samples);
  const reportsSkinTemp = rows.some((r) => r.skinTempC !== null);
  let previousEnd = -Infinity;
  return periods.map((period) => {
    const start = stillSince(rows, period.onset, previousEnd, reportsSkinTemp);
    previousEnd = Math.max(period.offset, period.onset + period.inBedS - 1);
    if (start >= period.onset) return period;
    const from = lowerBound(rows, period.onset);
    const to = lowerBound(rows, period.offset + 1);
    const restlessG = restlessThreshold(rows, from, to);
    const own = minuteStats(rows, from, to, Math.floor((period.offset - period.onset) / MINUTE_S) + 1, (t) => Math.floor((t - period.onset) / MINUTE_S), restlessG);
    const sleepingHr = median(own.hr.filter((v) => !Number.isNaN(v)));
    const minutes = Math.ceil((period.onset - start) / MINUTE_S);
    const lead = minuteStats(rows, lowerBound(rows, start), from, minutes, (t) => Math.floor((t - start) / MINUTE_S), restlessG);
    let asleepFrom = start;
    for (let k = 0; k < minutes; k++) {
      const raised = sleepingHr !== null && (lead.hr[k] ?? Number.NaN) - sleepingHr >= AWAKE_MIN_HR_RISE;
      if ((lead.restless[k] ?? 0) >= RESTLESS_MIN_S || raised) asleepFrom = Math.min(period.onset, start + (k + 1) * MINUTE_S);
    }
    return { ...period, onset: start, sleepOnset: asleepFrom, asleepS: period.asleepS + period.onset - asleepFrom, inBedS: period.inBedS + period.onset - start };
  });
}

function bedSince(rows: readonly Sample[], onset: number, after: number, reportsSkinTemp: boolean): number {
  let earliest = onset;
  let later: Sample | null = null;
  let counted = false;
  for (let i = lowerBound(rows, onset) - 1; i >= 0; i--) {
    const r = rows[i];
    if (r === undefined || r.t <= after || onset - r.t > BED_LEAD_IN_MAX_S || earliest - r.t > MINUTE_S) break;
    if (reportsSkinTemp && r.skinTempC === null) break;
    if (r.steps !== null) {
      if (later !== null && later.steps !== r.steps) return later.t + 1;
      later = r;
      counted = true;
    }
    earliest = r.t;
  }
  return counted ? earliest : onset;
}

// Before lying still the wearer is often already in bed, on the phone: the band says WAKE but counts no more steps.
// Time in bed starts after the last steps before the night (at most an hour earlier) and ends when the band saw the
// wearer get up. Neither end adds sleep.
export function withBedTime(periods: readonly SleepPeriod[], samples: readonly Sample[]): SleepPeriod[] {
  if (periods.length === 0) return [];
  const rows = sortedUnique(samples);
  const reportsSkinTemp = rows.some((r) => r.skinTempC !== null);
  let previousEnd = -Infinity;
  return periods.map((period) => {
    const bedOffset = period.bedOffset ?? period.onset + period.inBedS - 1;
    const bedOnset = Math.min(period.onset, bedSince(rows, period.onset, previousEnd, reportsSkinTemp));
    previousEnd = bedOffset;
    return { ...period, bedOnset, bedOffset, sleepOnset: period.sleepOnset ?? period.onset, inBedS: bedOffset - bedOnset + 1 };
  });
}
