import { test } from 'vitest';
import { activityMetrics, nightlyHrv, projectDayLoad, respiratoryRate, sortedUnique } from '../src';
import type { HrPoint, Interval, Sample } from '../src';
import { beatSamples, nightOf, sample } from '../test/helpers';

const NIGHT_S = 28_800;
const DAY_S = 86_400;

const night = nightOf([[0, NIGHT_S - 1]]);
const nightSamples = beatSamples({
  start: 0,
  seconds: NIGHT_S,
  rr: (t) => 1150 + 45 * Math.sin(2 * Math.PI * 0.25 * t),
});

const daySamples: Sample[] = Array.from({ length: DAY_S }, (_, t) => sample(t, { hr: 60 + (t % 40), state: 'WAKE' }));

const POINTS = 10_800;
const points: HrPoint[] = Array.from({ length: POINTS }, (_, t) => ({ t, hr: 90 + (t % 60) }));
const window: Interval = { start: 0, end: POINTS };
const paused: Interval[] = [0, 1, 2, 3, 4].map((i) => ({ start: 1_000 + i * 2_000, end: 1_300 + i * 2_000 }));

const RUN = { time: 1_500, warmupTime: 300 };

test('respiratory', async ({ bench }) => {
  await bench('respiratoryRate, 8 h night', () => {
    respiratoryRate(nightSamples, night);
  }).run(RUN);
});

test('series', async ({ bench }) => {
  await bench.compare(
    bench('sortedUnique, 86,400 ordered samples', () => {
      sortedUnique(daySamples);
    }),
    bench('nightlyHrv, 8 h night', () => {
      nightlyHrv(nightSamples, night);
    }),
    RUN,
  );
});

test('activity', async ({ bench }) => {
  await bench.compare(
    bench('activityMetrics, 10,800 points, 5 pauses', () => {
      activityMetrics(points, window, paused, 55, 185);
    }),
    bench('projectDayLoad, 10,800 points, 5 pauses', () => {
      projectDayLoad(20, POINTS, points, paused, 55, 185);
    }),
    RUN,
  );
});
