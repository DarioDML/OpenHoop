import { isValidHr, sortedUnique } from './series';
import type { Night, Sample, SleepPeriod } from './types';

export const SLEEP_SMOOTH_S = 300;
export const SLEEP_MAX_GAP_S = 600;
export const SLEEP_MIN_DURATION_S = 1200;
export const NIGHT_MERGE_GAP_S = 7200;
export const SLEEP_MAX_HR = 100;
export const SLEEP_MIN_SKIN_TEMP_SHARE = 0.5;

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
    let asleepS = 0;
    let hrMin: number | null = null;
    let hrSum = 0;
    let hrCount = 0;
    let seconds = 0;
    let warmSeconds = 0;
    let j = k;
    for (; j < n; j++) {
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
    k = j;
    if (reportsSkinTemp && warmSeconds < SLEEP_MIN_SKIN_TEMP_SHARE * seconds) continue;
    out.push({
      onset: start,
      offset: end,
      asleepS,
      inBedS: end - start + 1,
      hrMin,
      hrMean: hrCount > 0 ? hrSum / hrCount : null,
    });
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
