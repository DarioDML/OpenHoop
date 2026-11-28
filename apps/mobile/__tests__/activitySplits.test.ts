import { gpsSignal, latestSplits, markerStepM, routeSplits, type RoutePoint } from '@/data/route';
import { formatShortDistance, formatSpeed, unitLengthM } from '@/lib/units';

const LAT = 51.05;
const LON = 3.72;
const M_PER_DEG = 111_195;

function line(count: number, stepM: number, stepMs: number): RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({ tMs: i * stepMs, lat: LAT + (i * stepM) / M_PER_DEG, lon: LON, altM: null, accuracyM: 5, segment: 0 }));
}

describe('route splits per unit', () => {
  it('splits a route per kilometre with the time of each one', () => {
    const points = line(301, 10, 3_000);
    const splits = routeSplits(points, 'metric');
    expect(splits.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(splits.map((s) => s.distanceM)).toEqual([1000, 2000, 3000]);
    for (const split of splits) expect(split.durationS).toBeCloseTo(300, 0);
  });

  it('splits per mile with imperial units', () => {
    const points = line(400, 10, 2_000);
    const splits = routeSplits(points, 'imperial');
    expect(splits).toHaveLength(2);
    expect(splits[0]?.distanceM).toBeCloseTo(1609.344, 3);
    expect(splits[0]?.durationS).toBeCloseTo(321.9, 0);
  });

  it('leaves out the time between recorded parts', () => {
    const first = line(51, 10, 3_000);
    const second = line(51, 10, 3_000).map((p) => ({ ...p, tMs: p.tMs + 10_000_000, lat: p.lat + 600 / M_PER_DEG, segment: 1 }));
    const splits = routeSplits([...first, ...second], 'metric');
    expect(splits).toHaveLength(1);
    expect(splits[0]?.durationS).toBeCloseTo(300, 0);
  });

  it('returns the newest splits first', () => {
    const all = routeSplits(line(501, 10, 3_000), 'metric');
    expect(latestSplits(all, 3).map((s) => s.index)).toEqual([5, 4, 3]);
    expect(latestSplits(all.slice(0, 1), 3).map((s) => s.index)).toEqual([1]);
    expect(latestSplits([], 3)).toEqual([]);
  });

  it('places map markers in the chosen unit', () => {
    expect(markerStepM(3_000)).toBe(1_000);
    expect(markerStepM(1_000)).toBe(500);
    expect(markerStepM(2_000, 'imperial')).toBeCloseTo(unitLengthM('imperial') / 2, 3);
    expect(markerStepM(5_000, 'imperial')).toBeCloseTo(1609.344, 3);
    expect(markerStepM(70_000, 'imperial')).toBeCloseTo(16093.44, 2);
  });
});

describe('GPS signal', () => {
  it('rates the accuracy of the latest fix while recording', () => {
    expect(gpsSignal(true, 4)).toBe(3);
    expect(gpsSignal(true, 15)).toBe(2);
    expect(gpsSignal(true, 28)).toBe(1);
    expect(gpsSignal(true, 80)).toBe(0);
    expect(gpsSignal(true, null)).toBe(0);
    expect(gpsSignal(false, 4)).toBe(0);
    expect(gpsSignal(true, Number.NaN)).toBe(0);
  });
});

describe('unit formatting for routes', () => {
  it('formats speed and short distances in the chosen unit', () => {
    expect(formatSpeed(16.09344, 'imperial', 'en')).toEqual({ value: '10.0', unit: 'mph' });
    expect(formatSpeed(20, 'metric', 'nl')).toEqual({ value: '20,0', unit: 'km/h' });
    expect(formatShortDistance(200, 'metric', 'en')).toEqual({ value: '200', unit: 'm' });
    expect(formatShortDistance(200, 'imperial', 'en')).toEqual({ value: '660', unit: 'ft' });
    expect(unitLengthM('metric')).toBe(1000);
  });
});
