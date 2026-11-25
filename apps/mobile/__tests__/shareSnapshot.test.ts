import type { ActivityEntry } from '@/data/activities';
import { availableFields, buildSnapshot, DEFAULT_SELECTION, durationParity, toggleField, type SnapshotInput } from '@/data/shareSnapshot';

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
    const off = { name: false, date: false, duration: false, load: false, heartRate: false, zones: false, calories: false } as const;
    const view = buildSnapshot(input(), off);
    expect(view).toMatchObject({ name: null, day: null, duration: null, load: null, avgHr: null, maxHr: null, zones: null, calories: null, noHeartRate: false });
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
