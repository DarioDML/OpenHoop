import type { ActivityEntry } from '@/data/activities';
import { HIDDEN_ZONE_M, hideAroundEnds, haversineM, type RoutePoint } from '@/data/route';
import { availableFields, buildSnapshot, DEFAULT_SELECTION, durationParity, snapshotFileName, toggleField, type SnapshotInput } from '@/data/shareSnapshot';

function entry(over: Partial<ActivityEntry> = {}, metrics: Partial<ActivityEntry['metrics']> = {}): ActivityEntry {
  return {
    key: 'a:1',
    kind: 'manual',
    id: 1,
    detectedStart: null,
    type: 'running',
    label: null,
    start: 1000,
    end: 4600,
    note: 'private note',
    metrics: { activeS: 3600, load: 7.4, loadReason: null, zoneSeconds: [0, 600, 1200, 1200, 600, 0], avgHr: 140, maxHr: 175, activeMinutes: null, ...metrics },
    hasLoad: true,
    ...over,
  };
}

function input(over: Partial<ActivityEntry> = {}, metrics: Partial<ActivityEntry['metrics']> = {}, kcal: number | null = 420): SnapshotInput {
  return { entry: entry(over, metrics), day: '2026-11-24', kcal };
}

describe('snapshot fields', () => {
  it('shows everything except the name by default, each value with its parity level', () => {
    const view = buildSnapshot(input({ label: 'Evening run' }), DEFAULT_SELECTION);
    expect(view.name).toBeNull();
    expect(view.day).toBe('2026-11-24');
    expect(view.duration).toEqual({ seconds: 3600, level: 'D' });
    expect(view.load).toEqual({ value: 7.4, level: 'B' });
    expect(view.avgHr).toBe(140);
    expect(view.maxHr).toBe(175);
    expect(view.heartRateLevel).toBe('A');
    expect(view.zones?.level).toBe('B');
    expect(view.calories).toEqual({ kcal: 420, level: 'C' });
    expect(view.noHeartRate).toBe(false);
  });

  it('shows the name only when switched on', () => {
    const source = input({ label: 'Evening run' });
    expect(buildSnapshot(source, toggleField(DEFAULT_SELECTION, 'name', true)).name).toBe('Evening run');
    expect(buildSnapshot(source, DEFAULT_SELECTION).name).toBeNull();
  });

  it('never shows a blank name and does not offer the toggle', () => {
    const source = input({ label: '   ' });
    expect(availableFields(source)).not.toContain('name');
    expect(buildSnapshot(source, toggleField(DEFAULT_SELECTION, 'name', true)).name).toBeNull();
  });

  it('leaves out every field that is switched off', () => {
    const off = { route: false, load: false, hrChart: false, pace: false, name: false, date: false, duration: false, heartRate: false, zones: false, calories: false } as const;
    const view = buildSnapshot(withRoute(), off);
    expect(view).toMatchObject({ name: null, day: null, duration: null, load: null, avgHr: null, maxHr: null, zones: null, calories: null, noHeartRate: false, route: null, pace: null, hrChart: null });
  });

  it('hides the heart rate and the date independently', () => {
    const view = buildSnapshot(input(), toggleField(toggleField(DEFAULT_SELECTION, 'date', false), 'heartRate', false));
    expect(view.day).toBeNull();
    expect(view.avgHr).toBeNull();
    expect(view.maxHr).toBeNull();
    expect(view.noHeartRate).toBe(false);
    expect(view.load).not.toBeNull();
  });

  it('leaves out missing values without a placeholder', () => {
    const source = input({}, { load: null, loadReason: 'no-data', zoneSeconds: [0, 0, 0, 0, 0, 0] }, null);
    const view = buildSnapshot(source, DEFAULT_SELECTION);
    expect(view.load).toBeNull();
    expect(view.zones).toBeNull();
    expect(view.calories).toBeNull();
    expect(availableFields(source)).toEqual(['date', 'duration', 'heartRate']);
  });

  it('says there is no heart rate when the band recorded none', () => {
    const view = buildSnapshot(input({}, { avgHr: null, maxHr: null, load: null }), DEFAULT_SELECTION);
    expect(view.avgHr).toBeNull();
    expect(view.maxHr).toBeNull();
    expect(view.noHeartRate).toBe(true);
  });

  it('keeps one heart rate value when only the other is missing', () => {
    const view = buildSnapshot(input({}, { avgHr: 130, maxHr: null }), DEFAULT_SELECTION);
    expect(view.avgHr).toBe(130);
    expect(view.maxHr).toBeNull();
    expect(view.noHeartRate).toBe(false);
  });

  it('skips Load for a detected workout, which has none', () => {
    const view = buildSnapshot(input({ kind: 'detected', hasLoad: false, type: null }, { load: null }, null), DEFAULT_SELECTION);
    expect(view.load).toBeNull();
    expect(view.duration?.level).toBe('C');
  });

  it('grades the duration by where it came from', () => {
    expect(durationParity('detected')).toBe('C');
    expect(durationParity('edited')).toBe('D');
    expect(durationParity('manual')).toBe('D');
    expect(durationParity('live')).toBe('D');
  });

  it('keeps only the five zones when more are stored', () => {
    const view = buildSnapshot(input({}, { zoneSeconds: [100, 0, 600, 1200, 1200, 600] }), DEFAULT_SELECTION);
    expect(view.zones?.seconds).toEqual([0, 600, 1200, 1200, 600]);
  });
});

const LAT = 51.05;
const LON = 3.72;
const M_PER_DEG = 111_195;

function line(count: number, stepM: number): RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({ tMs: i * 10_000, lat: LAT + (i * stepM) / M_PER_DEG, lon: LON, altM: null, accuracyM: 5, segment: 0 }));
}

function withRoute(points: RoutePoint[] = line(101, 30)): SnapshotInput {
  return { ...input(), route: points, heartRate: [{ t: 1000, hr: 120 }, { t: 1100, hr: 140 }, { t: 1200, hr: 150 }] };
}

describe('route, pace and heart-rate chart on the image', () => {
  it('offers route, pace and the chart only when the data exists', () => {
    expect(availableFields(withRoute())).toEqual(['route', 'load', 'hrChart', 'pace', 'date', 'duration', 'heartRate', 'zones', 'calories']);
    expect(availableFields(input())).not.toContain('route');
    expect(availableFields({ ...withRoute(line(3, 10)) })).not.toContain('pace');
    expect(availableFields({ ...withRoute(), heartRate: [{ t: 1, hr: 100 }] })).not.toContain('hrChart');
  });

  it('draws the route and pace by default and the chart only when switched on', () => {
    const view = buildSnapshot(withRoute(), DEFAULT_SELECTION);
    expect(view.route?.points).toHaveLength(101);
    expect(view.route?.trimmed).toBe(false);
    expect(view.pace?.distanceM).toBeCloseTo(3000, 0);
    expect(view.pace?.secondsPerKm).toBeCloseTo(1200, 0);
    expect(view.pace?.usesPace).toBe(true);
    expect(view.hrChart).toBeNull();
    expect(buildSnapshot(withRoute(), toggleField(DEFAULT_SELECTION, 'hrChart', true)).hrChart?.points).toHaveLength(3);
  });

  it('cuts the privacy radius around the start and the end out of the drawn route', () => {
    const full = line(101, 30);
    const view = buildSnapshot(withRoute(full), DEFAULT_SELECTION, { privacyRadiusM: HIDDEN_ZONE_M });
    const kept = view.route?.points ?? [];
    expect(view.route?.trimmed).toBe(true);
    const first = full[0];
    const last = full[full.length - 1];
    if (first === undefined || last === undefined) throw new Error('route');
    expect(kept.every((p) => haversineM(first, p) >= HIDDEN_ZONE_M && haversineM(last, p) >= HIDDEN_ZONE_M)).toBe(true);
    expect(kept.length).toBe(101 - 7 - 7);
    expect(view.pace?.distanceM).toBeCloseTo(3000, 0);
  });

  it('says when nothing of the route is left after hiding the ends', () => {
    const view = buildSnapshot(withRoute(line(11, 30)), DEFAULT_SELECTION, { privacyRadiusM: HIDDEN_ZONE_M });
    expect(view.route).toBeNull();
    expect(view.routeHiddenAway).toBe(true);
    expect(buildSnapshot(withRoute(line(11, 30)), toggleField(DEFAULT_SELECTION, 'route', false), { privacyRadiusM: 200 }).routeHiddenAway).toBe(false);
  });

  it('names the saved file after the activity, day, format and moment, so a second save gets its own file', () => {
    expect(snapshotFileName('running', '2026-11-24', 'story', 1_795_537_800_123)).toBe('openhoop-running-2026-11-24-story-1795537800123.png');
    expect(snapshotFileName('running', '2026-11-24', 'story', 1_795_537_801_000)).not.toBe(snapshotFileName('running', '2026-11-24', 'story', 1_795_537_800_123));
    expect(snapshotFileName(null, '../../etc', 'square', Number.NaN)).toBe('openhoop-workout-activity-square.png');
  });
});

describe('hiding the ends of a route', () => {
  it('drops every point near the start or the end, also where a loop passes them again', () => {
    const out = line(21, 50);
    const back = [...out, ...out.slice(0, -1).reverse().map((p, i) => ({ ...p, tMs: 300_000 + i * 10_000, lon: p.lon + 0.004 }))];
    const kept = hideAroundEnds(back, 120);
    const start = back[0];
    if (start === undefined) throw new Error('route');
    expect(kept.every((p) => haversineM(start, p) >= 120)).toBe(true);
    expect(kept.length).toBeGreaterThan(0);
  });

  it('starts a new segment across a hidden stretch so no line connects through it', () => {
    const points = [...line(10, 50), ...line(10, 50).map((p) => ({ ...p, tMs: p.tMs + 200_000, lat: p.lat + 900 / M_PER_DEG }))];
    const near = points.map((p, i) => (i === 10 ? { ...p, lat: LAT - 1 / M_PER_DEG } : p));
    const kept = hideAroundEnds(near, 30);
    const segments = new Set(kept.map((p) => p.segment));
    expect(segments.size).toBeGreaterThan(1);
  });

  it('keeps every point with no radius and handles an empty route', () => {
    const points = line(5, 10);
    expect(hideAroundEnds(points, 0)).toEqual(points);
    expect(hideAroundEnds([], 200)).toEqual([]);
  });
});
