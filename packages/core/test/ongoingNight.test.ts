import { describe, expect, it } from 'vitest';
import type { Sample } from '@openhoop/analytics';
import { awakeNow, nightNow } from '../src/index';

const NOW = 1_800_000_000;

function sample(t: number, state: Sample['state'], hr = 55, motionG = 0.01): Sample {
  return { t, hr, rr: [], steps: null, skinTempC: 34, spo2Raw: null, state, motionG };
}

function stretch(from: number, to: number, state: Sample['state'], hr = 55): Sample[] {
  const out: Sample[] = [];
  for (let t = from; t < to; t++) out.push(sample(t, state, hr, state === 'SLEEP' ? 0.005 : 0.08));
  return out;
}

describe('nightNow', () => {
  it('finds the ongoing night and its latest stage estimates', () => {
    const samples = [...stretch(NOW - 7 * 3600 - 600, NOW - 7 * 3600, 'WAKE', 70), ...stretch(NOW - 7 * 3600, NOW, 'SLEEP', 52)];
    const night = nightNow(samples, NOW);
    expect(night.onset).not.toBeNull();
    expect(Math.abs((night.onset ?? 0) - (NOW - 7 * 3600))).toBeLessThan(600);
    expect(night.asleepS).toBeGreaterThan(6 * 3600);
    expect(night.recent?.length).toBeGreaterThan(0);
    expect(night.awake).toBe(false);
    for (const epoch of night.recent ?? []) expect(epoch.wake + epoch.light).toBeLessThanOrEqual(1);
  });

  it('reports no ongoing night once the sleep ended long ago, and that the wearer is awake', () => {
    const samples = [...stretch(NOW - 9 * 3600, NOW - 2 * 3600, 'SLEEP', 52), ...stretch(NOW - 2 * 3600, NOW, 'WAKE', 75)];
    const night = nightNow(samples, NOW);
    expect(night.onset).toBeNull();
    expect(night.awake).toBe(true);
  });

  it('does not call a gap without readings awake', () => {
    expect(awakeNow(stretch(NOW - 120, NOW, 'WAKE'), NOW)).toBe(false);
    expect(awakeNow([], NOW)).toBe(false);
  });
});
