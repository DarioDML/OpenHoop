import { nightGuard, nightSeconds, periodSlices, sortedUnique } from './series';
import { ALGO, fail, succeed } from './types';
import type { Night, Outcome, Sample } from './types';

export const SKIN_TEMP_MIN_COVERAGE = 0.5;

export function nightlySkinTemp(
  samples: Sample[],
  night: Night,
  baselineC: number | null,
): Outcome<{ meanC: number; deviationC: number | null }> {
  const guard = nightGuard(samples, night);
  if (guard !== null) return fail(guard, ALGO.skinTemp);
  const inside = periodSlices(sortedUnique(samples), night).flat();
  if (inside.length === 0) return fail('no-data', ALGO.skinTemp);
  let sum = 0;
  let count = 0;
  for (const s of inside) {
    if (s.skinTempC === null || !Number.isFinite(s.skinTempC)) continue;
    sum += s.skinTempC;
    count++;
  }
  if (count === 0) return fail('missing-signal', ALGO.skinTemp);
  const coverage = count / nightSeconds(night);
  if (coverage < SKIN_TEMP_MIN_COVERAGE) return fail('low-coverage', ALGO.skinTemp);
  const meanC = sum / count;
  return succeed({ meanC, deviationC: baselineC === null ? null : meanC - baselineC }, coverage, ALGO.skinTemp);
}
