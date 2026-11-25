import {
  checkFix,
  cumulativeM,
  distanceMarkers,
  elevationGainM,
  filterFixes,
  formatPace,
  haversineM,
  markerStepM,
  maxSpeedFor,
  paceSecondsPerKm,
  routeStats,
  SEGMENT_GAP_MS,
  speedKmh,
  splits,
  toPoint,
  usesPace,
  visibleRoute,
  type Fix,
  type RoutePoint,
} from '@/data/route';
import { defaultUserData, parseUserData, serializeUserData } from '@/data/userData';

const T0 = 1_800_000_000_000;
const LAT = 51.05;
const LON = 3.72;
const M_PER_DEG_LAT = haversineM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });

function fix(i: number, over: Partial<Fix> = {}): Fix {
  return { tMs: T0 + i * 2000, lat: LAT + (i * 5) / M_PER_DEG_LAT, lon: LON, altM: null, accuracyM: 5, ...over };
}

function line(count: number, stepM: number, stepMs: number, over: (i: number) => Partial<RoutePoint> = () => ({})): RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    tMs: T0 + i * stepMs,
    lat: LAT + (i * stepM) / M_PER_DEG_LAT,
    lon: LON,
    altM: null,
    accuracyM: 5,
    segment: 0,
    ...over(i),
  }));
}

describe('route distance', () => {
  it('uses the haversine distance on a sphere', () => {
    expect(M_PER_DEG_LAT).toBeCloseTo(111_195, -1);
    expect(haversineM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111_195, -1);
    expect(haversineM({ lat: 60, lon: 0 }, { lat: 60, lon: 1 })).toBeCloseTo(55_597, -1);
    expect(haversineM({ lat: 50.85, lon: 4.35 }, { lat: 51.05, lon: 3.72 })).toBeCloseTo(49_200, -3);
    expect(haversineM({ lat: LAT, lon: LON }, { lat: LAT, lon: LON })).toBe(0);
  });

  it('adds distance within a segment and not across a gap', () => {
    const points = line(11, 100, 30_000, (i) => ({ segment: i < 6 ? 0 : 1 }));
    const cum = cumulativeM(points);
    expect(cum[5]).toBeCloseTo(500, 3);
    expect(cum[6]).toBeCloseTo(500, 3);
    expect(cum[10]).toBeCloseTo(900, 3);
    expect(routeStats(points)).toMatchObject({ segments: 2, elevationGainM: null });
    expect(routeStats(points).distanceM).toBeCloseTo(900, 3);
    expect(routeStats([]).distanceM).toBe(0);
  });
});

describe('pace and speed', () => {
  it('uses the active time and needs 100 m', () => {
    expect(paceSecondsPerKm(5000, 1500)).toBe(300);
    expect(formatPace(300)).toBe('5:00');
    expect(formatPace(332.4)).toBe('5:32');
    expect(speedKmh(20_000, 3600)).toBe(20);
    expect(paceSecondsPerKm(99, 60)).toBeNull();
    expect(speedKmh(5000, 0)).toBeNull();
  });

  it('shows pace for foot activities and speed otherwise', () => {
    expect(usesPace('running')).toBe(true);
    expect(usesPace('hiking')).toBe(true);
    expect(usesPace('cycling')).toBe(false);
    expect(maxSpeedFor('walking')).toBeLessThan(maxSpeedFor('cycling'));
  });
});

describe('bad fixes', () => {
  it('drops invalid, inaccurate, stale and impossible fixes', () => {
    const last = toPoint(null, fix(0), 0);
    const max = maxSpeedFor('running');
    expect(checkFix(null, fix(0), max, 0)).toBe('ok');
    expect(checkFix(null, fix(0, { lat: Number.NaN }), max, 0)).toBe('invalid');
    expect(checkFix(null, fix(0, { lat: 0, lon: 0 }), max, 0)).toBe('invalid');
    expect(checkFix(null, fix(0, { lat: 95 }), max, 0)).toBe('invalid');
    expect(checkFix(null, fix(0, { accuracyM: 31 }), max, 0)).toBe('inaccurate');
    expect(checkFix(null, fix(0, { accuracyM: null }), max, 0)).toBe('inaccurate');
    expect(checkFix(last, fix(0), max, 0)).toBe('stale');
    expect(checkFix(last, fix(1, { lat: LAT + 100 / M_PER_DEG_LAT }), max, 0)).toBe('too-fast');
    expect(checkFix(last, fix(1, { lat: LAT + 0.5 / M_PER_DEG_LAT }), max, 0)).toBe('still');
    expect(checkFix(last, fix(1), max, 0)).toBe('ok');
  });

  it('allows a jump after a pause or a long gap and starts a new segment', () => {
    const last = toPoint(null, fix(0), 0);
    const far = fix(1, { lat: LAT + 0.01 });
    expect(checkFix(last, far, 12, 1)).toBe('ok');
    const late = fix(0, { tMs: T0 + SEGMENT_GAP_MS + 1, lat: LAT + 0.01 });
    expect(checkFix(last, late, 12, 0)).toBe('ok');
    expect(toPoint(last, late, 0).segment).toBe(1);
    expect(toPoint(last, fix(1), 0).segment).toBe(0);
  });

  it('filters a recorded stream and counts what it skipped', () => {
    const fixes = [fix(0), fix(1, { accuracyM: 80 }), fix(2), fix(3, { lat: LAT + 0.02 }), fix(4), fix(5, { tMs: T0 })];
    const { points, rejected } = filterFixes(fixes, maxSpeedFor('running'));
    expect(points.map((p) => p.tMs)).toEqual([T0, T0 + 4000, T0 + 8000]);
    expect(rejected).toBe(3);
  });
});

describe('elevation gain', () => {
  it('ignores noise below 3 m and counts real climbs', () => {
    const noisy = line(6, 10, 2000, (i) => ({ altM: [10, 12, 10, 11, 9, 11][i] ?? null }));
    expect(elevationGainM(noisy)).toBe(0);
    const climb = line(6, 10, 2000, (i) => ({ altM: [10, 14, 18, 15, 11, 20][i] ?? null }));
    expect(elevationGainM(climb)).toBe(17);
  });

  it('does not count a climb across a segment break', () => {
    const points = line(4, 10, 2000, (i) => ({ altM: [10, 10, 50, 50][i] ?? null, segment: i < 2 ? 0 : 1 }));
    expect(elevationGainM(points)).toBe(0);
  });

  it('needs altitude on most points', () => {
    expect(elevationGainM(line(6, 10, 2000))).toBeNull();
    expect(elevationGainM(line(6, 10, 2000, (i) => ({ altM: i === 0 ? 5 : null })))).toBeNull();
  });
});

describe('markers, splits and hidden zones', () => {
  it('places a marker at every step with its moving time', () => {
    const points = line(31, 100, 30_000);
    const markers = distanceMarkers(points, 1000);
    expect(markers.map((m) => m.distanceM)).toEqual([1000, 2000, 3000]);
    expect(markers[0]?.movingS).toBeCloseTo(300, 3);
    expect(markers[0]?.lat).toBeCloseTo(LAT + 1000 / M_PER_DEG_LAT, 6);
    expect(splits(markers).map((s) => Math.round(s.durationS))).toEqual([300, 300, 300]);
    expect(markerStepM(800)).toBe(500);
    expect(markerStepM(5000)).toBe(1000);
    expect(markerStepM(21_000)).toBe(5000);
  });

  it('leaves paused time out of a split', () => {
    const points = line(12, 100, 30_000, (i) => (i >= 6 ? { segment: 1, tMs: T0 + i * 30_000 + 600_000 } : {}));
    const [first] = splits(distanceMarkers(points, 1000));
    expect(first?.durationS).toBeCloseTo(300, 3);
  });

  it('hides the first and last 200 m and the markers in them', () => {
    const points = line(21, 100, 30_000);
    const full = visibleRoute(points, 0, 0, 500);
    expect(full?.points).toHaveLength(21);
    expect(full?.trimmed).toBe(false);
    const hidden = visibleRoute(points, 200, 200, 500);
    expect(hidden?.trimmed).toBe(true);
    expect(hidden?.points[0]?.lat).toBeCloseTo(LAT + 200 / M_PER_DEG_LAT, 9);
    expect(hidden?.points[hidden.points.length - 1]?.lat).toBeCloseTo(LAT + 1800 / M_PER_DEG_LAT, 9);
    expect(hidden?.markers.map((m) => m.distanceM)).toEqual([500, 1000, 1500]);
    expect(visibleRoute(points, 200, 0, 500)?.points).toHaveLength(19);
  });

  it('shows nothing when the route is shorter than both hidden zones', () => {
    expect(visibleRoute(line(4, 100, 30_000), 200, 200, 500)).toBeNull();
    expect(visibleRoute(line(1, 100, 30_000), 0, 0, 500)).toBeNull();
  });
});

describe('hidden route ends setting', () => {
  it('is on by default and only accepts a boolean', () => {
    expect(defaultUserData().hideRouteEnds).toBe(true);
    expect(parseUserData(null).hideRouteEnds).toBe(true);
    expect(parseUserData(JSON.stringify({ hideRouteEnds: 'no' })).hideRouteEnds).toBe(true);
    expect(parseUserData(serializeUserData({ ...defaultUserData(), hideRouteEnds: false })).hideRouteEnds).toBe(false);
  });
});
