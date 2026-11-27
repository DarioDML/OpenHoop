import type { ActivityRow, DayRecord, VendorCycle, VendorSleep } from '@openhoop/core';
import { act, renderHook } from '@testing-library/react-native';

import { MIN_PAIRS, compareWithOfficial, pairedCycle, pairedSleep, summarise } from '@/data/accuracy';
import { isoWeekNumber, weeklyCharges } from '@/data/charges';
import { createFixtureDays } from '@/data/fixtureSource';
import { previewCounts, vendorFrom } from '@/data/vendorExport/preview';
import { autoShareCandidates, defaultAutoSharePrefs, parseAutoSharePrefs, sharesType, toggleType, withMode } from '@/strava/autoShare';

import { isCustomLayout, previousLayoutPatch } from '@/data/layoutRestore';
import { DEFAULT_DASHBOARD, HOME_SECTIONS, defaultUserData, parseUserData, serializeUserData } from '@/data/userData';
import { getThemePreference, isDarkScheme, setThemePreference } from '@/lib/themePreference';
import { presetChoice, presetOf } from '@/ui/manage/notificationPresets';
import { compactCount, sizeParts } from '@/ui/manage/storageFormat';
import { darkColors, lightColors, useTheme } from '@/ui/theme';

import { FIXTURE_NOW } from './support/appData';

describe('user data for the settings screens', () => {
  it('keeps a known wear location and drops anything else', () => {
    expect(defaultUserData().wearLocation).toBeNull();
    expect(parseUserData(serializeUserData({ ...defaultUserData(), wearLocation: 'bicep' })).wearLocation).toBe('bicep');
    expect(parseUserData(JSON.stringify({ wearLocation: 'ankle' })).wearLocation).toBeNull();
    expect(parseUserData(JSON.stringify({ wearLocation: 3 })).wearLocation).toBeNull();
  });

  it('keeps the theme choice and falls back to the system theme', () => {
    expect(defaultUserData().theme).toBe('system');
    expect(parseUserData(JSON.stringify({ theme: 'light' })).theme).toBe('light');
    expect(parseUserData(JSON.stringify({ theme: 'sepia' })).theme).toBe('system');
  });

  it('keeps goal alerts on and coach check-ins off unless chosen otherwise', () => {
    expect(defaultUserData().notifications.goals).toBe(true);
    expect(parseUserData(JSON.stringify({ notifications: { goals: false } })).notifications.goals).toBe(false);
    expect(parseUserData(JSON.stringify({ notifications: { coachCheckins: true } })).notifications.coachCheckins).toBe(true);
    expect(parseUserData(JSON.stringify({ notifications: { coachCheckins: 'yes' } })).notifications.coachCheckins).toBe(false);
  });
});

describe('theme preference', () => {
  afterEach(async () => {
    await act(async () => setThemePreference('system'));
  });

  it('decides dark or light from the choice, and from the phone only for System', () => {
    expect(isDarkScheme('system', 'light')).toBe(false);
    expect(isDarkScheme('system', 'dark')).toBe(true);
    expect(isDarkScheme('system', null)).toBe(true);
    expect(isDarkScheme('light', 'dark')).toBe(false);
    expect(isDarkScheme('dark', 'light')).toBe(true);
  });

  it('makes useTheme follow the stored choice everywhere', async () => {
    const { result } = await renderHook(() => useTheme());
    await act(async () => setThemePreference('light'));
    expect(getThemePreference()).toBe('light');
    expect(result.current.dark).toBe(false);
    expect(result.current.colors).toBe(lightColors);
    await act(async () => setThemePreference('dark'));
    expect(result.current.dark).toBe(true);
    expect(result.current.colors).toBe(darkColors);
  });
});

describe('home layout restore', () => {
  it('swaps the current and the previous layout, and reports when nothing is saved', () => {
    const base = defaultUserData();
    expect(previousLayoutPatch(base)).toBeNull();
    expect(isCustomLayout(base)).toBe(false);
    const custom = { ...base, dashboardTiles: ['steps' as const], previousDashboardTiles: [...DEFAULT_DASHBOARD] };
    expect(isCustomLayout(custom)).toBe(true);
    expect(previousLayoutPatch(custom)).toEqual({ dashboardTiles: DEFAULT_DASHBOARD, previousDashboardTiles: ['steps'] });
    const sections = { ...base, homeSections: [...HOME_SECTIONS].reverse(), previousHomeSections: [...HOME_SECTIONS] };
    expect(previousLayoutPatch(sections)).toEqual({ homeSections: HOME_SECTIONS, previousHomeSections: [...HOME_SECTIONS].reverse() });
  });
});

describe('notification presets', () => {
  it('recognises each preset and a mix that is none of them', () => {
    const prefs = defaultUserData().notifications;
    expect(presetOf(prefs)).toBe('standard');
    expect(presetOf({ ...prefs, ...presetChoice('quiet') })).toBe('quiet');
    expect(presetOf({ ...prefs, ...presetChoice('everything') })).toBe('everything');
    expect(presetOf({ ...prefs, morningDigest: false })).toBeNull();
  });
});

describe('Strava auto-share', () => {
  const days = createFixtureDays(FIXTURE_NOW);
  const today = days[days.length - 1];
  const nowS = Math.floor(FIXTURE_NOW.getTime() / 1000);
  const run = (id: number, type: string, start: number, end: number): ActivityRow => ({
    id,
    deviceId: 1,
    source: 'manual',
    detectedStart: null,
    type,
    start,
    end,
    paused: [],
    note: null,
    deletedAt: null,
    metrics: { activeS: end - start, load: null, loadReason: 'no-data', zoneSeconds: [0, 0, 0, 0, 0, 0], avgHr: null, maxHr: null, hrSeconds: 0, activeMinutes: null },
    createdAt: start,
    updatedAt: start,
  });
  const base = { days: today === undefined ? [] : [today], ledger: {}, failed: new Set<string>(), nowS };
  const dayStart = today?.start ?? 0;
  const activities = [run(1, 'running', dayStart + 3_600, dayStart + 5_400), run(2, 'yoga', dayStart + 6_000, dayStart + 7_000)];

  it('reads stored prefs safely and starts a share window when turned on', () => {
    expect(parseAutoSharePrefs(undefined)).toEqual(defaultAutoSharePrefs());
    expect(parseAutoSharePrefs({ mode: 'byType', types: ['cycling', 'darts', 'running'], since: 5 })).toEqual({ mode: 'byType', types: ['running', 'cycling'], since: 5 });
    expect(parseAutoSharePrefs({ mode: 'manual', since: 5 }).since).toBeNull();
    const on = withMode(defaultAutoSharePrefs(), 'all', 100);
    expect(on.since).toBe(100);
    expect(withMode(on, 'byType', 200).since).toBe(100);
    expect(withMode(on, 'manual', 300).since).toBeNull();
    expect(toggleType(toggleType(defaultAutoSharePrefs(), 'running'), 'swimming').types).toEqual(['cycling', 'swimming']);
  });

  it('shares nothing in manual mode', () => {
    expect(autoShareCandidates({ ...base, activities, prefs: defaultAutoSharePrefs() })).toEqual([]);
  });

  it('shares activities that started after it was turned on and have settled, once', () => {
    const prefs = { mode: 'all' as const, types: [], since: dayStart };
    const all = autoShareCandidates({ ...base, activities, prefs }).map((candidate) => candidate.entry.id);
    expect(all).toEqual(expect.arrayContaining([1, 2]));
    expect(autoShareCandidates({ ...base, activities, prefs: { ...prefs, since: dayStart + 4_000 } }).map((candidate) => candidate.entry.id)).not.toContain(1);
    expect(autoShareCandidates({ ...base, activities, prefs, nowS: dayStart + 5_400 + 60 }).map((candidate) => candidate.entry.id)).not.toContain(1);
    const shared = autoShareCandidates({ ...base, activities, prefs, ledger: { 'activity:1': { status: 'done', uploadId: null, activityId: '9', at: 1 } } });
    expect(shared.map((candidate) => candidate.entry.id)).not.toContain(1);
    expect(autoShareCandidates({ ...base, activities, prefs, failed: new Set(['activity:2']) }).map((candidate) => candidate.entry.id)).not.toContain(2);
  });

  it('shares only the picked types in By type mode', () => {
    const prefs = { mode: 'byType' as const, types: ['running' as const], since: dayStart };
    expect(autoShareCandidates({ ...base, activities, prefs }).map((candidate) => candidate.entry.type)).toEqual(['running']);
    expect(sharesType(prefs, null)).toBe(false);
  });
});

describe('storage settings', () => {
  it('keeps only the offered raw retention periods', () => {
    expect(defaultUserData().rawRetentionDays).toBeNull();
    expect(parseUserData(JSON.stringify({ rawRetentionDays: 7 })).rawRetentionDays).toBe(7);
    expect(parseUserData(JSON.stringify({ rawRetentionDays: 30 })).rawRetentionDays).toBe(30);
    expect(parseUserData(JSON.stringify({ rawRetentionDays: 1 })).rawRetentionDays).toBeNull();
  });

  it('writes sizes and counts short', () => {
    expect(sizeParts(1_400_000_000, 'en')).toEqual({ value: '1.4', unit: 'GB' });
    expect(sizeParts(512, 'en')).toEqual({ value: '512', unit: 'B' });
    expect(sizeParts(250_000_000, 'nl')).toEqual({ value: '250', unit: 'MB' });
    expect(sizeParts(1_500_000, 'nl')).toEqual({ value: '1,5', unit: 'MB' });
    expect(compactCount(412_345, 'en')).toBe('412k');
    expect(compactCount(4_200, 'en')).toBe('4.2k');
    expect(compactCount(980, 'en')).toBe('980');
    expect(compactCount(3_400_000, 'en')).toBe('3.4M');
  });
});

describe('accuracy against imported official values', () => {
  const days = createFixtureDays(FIXTURE_NOW).filter((day) => day.readiness.value !== null && day.hrv.value !== null);
  const cycle = (day: (typeof days)[number], shift: number): VendorCycle => ({
    startT: day.start,
    endT: day.end,
    tzOffsetS: day.tzOffsetS,
    day: day.day,
    recoveryPct: (day.readiness.value ?? 0) + shift,
    restingHr: null,
    hrvMs: (day.hrv.value ?? 0) - 8,
    skinTempC: null,
    spo2Pct: null,
    respiratoryRate: null,
    dayStrain: null,
  });

  it('reports the mean absolute difference only from enough paired nights, against the target', () => {
    const vendor = { cycles: days.slice(0, 4).map((day, i) => cycle(day, i % 2 === 0 ? 2 : -4)), sleeps: [], workouts: [], journal: [] };
    const result = compareWithOfficial(days, vendor);
    const readiness = result.find((item) => item.metric === 'readiness');
    expect(readiness).toEqual({ metric: 'readiness', pairs: 4, meanAbsError: 3, target: 5, pass: true });
    expect(result.find((item) => item.metric === 'hrv')).toMatchObject({ pairs: 4, meanAbsError: 8, pass: false });
    expect(result.find((item) => item.metric === 'load')).toMatchObject({ pairs: 0, meanAbsError: null, pass: null });
    expect(summarise(result)).toEqual({ measured: 2, withTarget: 2, passing: 1, nights: 4 });
    const few = compareWithOfficial(days, { ...vendor, cycles: vendor.cycles.slice(0, MIN_PAIRS - 1) });
    expect(few.every((item) => item.meanAbsError === null)).toBe(true);
  });
});

describe('import preview', () => {
  it('counts what a file holds and keeps only days from a start day', () => {
    const cycle = (day: string): VendorCycle => ({ startT: 1, endT: 2, tzOffsetS: 0, day, recoveryPct: 50, restingHr: null, hrvMs: null, skinTempC: null, spo2Pct: null, respiratoryRate: null, dayStrain: null });
    const data = {
      cycles: [cycle('2024-01-01'), cycle('2024-01-03')],
      sleeps: [],
      workouts: [],
      journal: [
        { cycleStart: 1, tzOffsetS: 0, day: '2024-01-03', question: 'q1', answeredYes: true, notes: null },
        { cycleStart: 1, tzOffsetS: 0, day: '2024-01-03', question: 'q2', answeredYes: false, notes: null },
      ],
    };
    expect(previewCounts(data)).toEqual({ cycles: 2, sleeps: 0, workouts: 0, journalDays: 1, days: 2 });
    expect(previewCounts(vendorFrom(data, '2024-01-02'))).toEqual({ cycles: 1, sleeps: 0, workouts: 0, journalDays: 1, days: 1 });
    expect(vendorFrom(data, null)).toBe(data);
  });
});

describe('band charges per week', () => {
  it('numbers ISO weeks', () => {
    expect(isoWeekNumber('2026-11-25')).toBe(48);
    expect(isoWeekNumber('2026-01-01')).toBe(1);
    expect(isoWeekNumber('2027-01-01')).toBe(53);
    expect(isoWeekNumber('2024-12-30')).toBe(1);
  });

  it('counts charge starts in each week of the last 30 days', () => {
    const nowS = Date.UTC(2026, 10, 25, 12) / 1000;
    const weeks = weeklyCharges([nowS - 3_600, nowS - 2 * 86_400, nowS - 20 * 86_400, nowS - 40 * 86_400], nowS, 0);
    expect(weeks.map((week) => week.isoWeek)).toEqual([44, 45, 46, 47, 48]);
    expect(weeks.map((week) => week.count)).toEqual([0, 1, 0, 0, 2]);
  });
});

describe('accuracy pairs nights by time, not by date label', () => {
  const template = createFixtureDays(FIXTURE_NOW).find((day) => day.readiness.value !== null && day.sleep.score.value !== null);
  if (template === undefined) throw new Error('fixture has no scored day');
  const DAY = 86_400;
  const night = (start: number, index: number): DayRecord => ({
    ...template,
    day: new Date((start + 8 * 3_600) * 1000).toISOString().slice(0, 10),
    start,
    readiness: { ...template.readiness, value: 60 + index },
    sleep: {
      ...template.sleep,
      score: { ...template.sleep.score, value: 80 + index },
      periods: [{ onset: start, offset: start + 8 * 3_600, asleepS: 7 * 3_600, inBedS: 8 * 3_600, nap: false, source: 'detected', editId: null }],
    },
  });
  const cycle = (startT: number, day: string, recoveryPct: number): VendorCycle => ({
    startT,
    endT: startT + DAY,
    tzOffsetS: 3_600,
    day,
    recoveryPct,
    restingHr: null,
    hrvMs: null,
    skinTempC: null,
    spo2Pct: null,
    respiratoryRate: null,
    dayStrain: null,
  });
  const sleep = (onset: number, day: string, performancePct: number): VendorSleep => ({
    onset,
    wake: onset + 8 * 3_600,
    tzOffsetS: 3_600,
    day,
    nap: false,
    performancePct,
    asleepMin: 420,
    inBedMin: 480,
    lightMin: null,
    deepMin: null,
    remMin: null,
    awakeMin: null,
    efficiencyPct: null,
    consistencyPct: null,
    respiratoryRate: null,
  });
  const onsetDay = (t: number): string => new Date((t + 3_600) * 1000).toISOString().slice(0, 10);

  it('pairs a 23:00 bedtime whose official cycle carries the onset date', () => {
    const starts = [0, 1, 2].map((i) => Date.UTC(2026, 10, 20 + i, 22, 0) / 1000);
    const days = starts.map((start, i) => night(start, i));
    expect(days.every((day, i) => day.day !== onsetDay(starts[i] ?? 0))).toBe(true);
    const vendor = {
      cycles: starts.map((start, i) => cycle(start + 300, onsetDay(start), 60 + i + 2)),
      sleeps: starts.map((start, i) => sleep(start + 600, onsetDay(start), 80 + i - 3)),
      workouts: [],
      journal: [],
    };
    const result = compareWithOfficial(days, vendor);
    expect(result.find((item) => item.metric === 'readiness')).toMatchObject({ pairs: 3, meanAbsError: 2 });
    expect(result.find((item) => item.metric === 'sleepScore')).toMatchObject({ pairs: 3, meanAbsError: 3 });
  });

  it('pairs a bedtime after midnight and picks the closest of two cycles on the same date', () => {
    const starts = [0, 1, 2].map((i) => Date.UTC(2026, 10, 21 + i, 0, 30) / 1000);
    const days = starts.map((start, i) => night(start, i));
    const near = starts.map((start, i) => cycle(start - 200, onsetDay(start), 60 + i + 1));
    const decoys = starts.map((start) => cycle(start + 2 * 3_600 + 1_800, onsetDay(start), 5));
    const result = compareWithOfficial(days, { cycles: [...decoys, ...near], sleeps: [], workouts: [], journal: [] });
    expect(result.find((item) => item.metric === 'readiness')).toMatchObject({ pairs: 3, meanAbsError: 1 });
    expect(pairedCycle(days[0] as DayRecord, [cycle((starts[0] ?? 0) + 4 * 3_600, 'x', 1)])).toBeNull();
  });

  it('pairs no official sleep that does not overlap our main sleep', () => {
    const start = Date.UTC(2026, 10, 20, 22, 0) / 1000;
    const day = night(start, 0);
    expect(pairedSleep(day, [sleep(start + 12 * 3_600, 'x', 50)])).toBeNull();
    expect(pairedSleep(day, [sleep(start + 12 * 3_600, 'x', 50), sleep(start - 1_800, 'y', 70)])?.performancePct).toBe(70);
  });
});
