import type { ActivityRow, DayRecord } from '@openhoop/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  dayEntries,
  dayOfActivity,
  dayTotals,
  defaultForm,
  entryById,
  entryForWorkout,
  parseClock,
  parseIdParam,
  validateActivityForm,
  type ActivityForm,
} from '@/data/activities';
import { createFixtureDays } from '@/data/fixtureSource';
import { activeSeconds, hudFor, IDLE_SESSION, liveReducer, sessionWindow, type LiveSession } from '@/data/liveSession';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';

import { FIXTURE_NOW, withAppData } from './support/appData';

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import AddActivityScreen from '@/app/activity/add';
import ActivityDetailsScreen from '@/app/activity/details';
import EditActivityScreen from '@/app/activity/edit';
import LiveActivityScreen from '@/app/activity/live';
import LoadScreen from '@/app/load/index';

const days = createFixtureDays(FIXTURE_NOW);
const NOW_S = Math.floor(FIXTURE_NOW.getTime() / 1000);
const TZ = 0;

function lastDay(): DayRecord {
  const day = days[days.length - 1];
  if (day === undefined) throw new Error('fixture has no days');
  return day;
}

function dayWithWorkout(): DayRecord {
  const day = [...days].reverse().find((d) => d.workouts.some((w) => w.source === 'auto'));
  if (day === undefined) throw new Error('fixture has no detected workout');
  return day;
}

function activity(over: Partial<ActivityRow> = {}): ActivityRow {
  const day = lastDay();
  return {
    id: 7,
    deviceId: 1,
    source: 'manual',
    detectedStart: null,
    type: 'cycling',
    start: day.start + 3600,
    end: day.start + 5400,
    paused: [],
    note: null,
    deletedAt: null,
    metrics: { activeS: 1800, load: 6.2, loadReason: null, zoneSeconds: [0, 300, 600, 600, 300, 0], avgHr: 141, maxHr: 172, hrSeconds: 1800 },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function form(over: Partial<ActivityForm> = {}): ActivityForm {
  return { type: 'running', date: '2026-11-24', startTime: '07:00', endTime: '07:45', note: '', ...over };
}

beforeEach(() => {
  mockParams = {};
  jest.clearAllMocks();
});

describe('activity form validation', () => {
  it('accepts a valid past activity and trims the note', () => {
    const result = validateActivityForm(form({ note: '  tempo  ' }), NOW_S, TZ);
    expect(result).toEqual({
      ok: true,
      value: { type: 'running', start: Date.UTC(2026, 10, 24, 7, 0) / 1000, end: Date.UTC(2026, 10, 24, 7, 45) / 1000, note: 'tempo' },
    });
  });

  it('rejects unknown types, bad dates and bad times', () => {
    expect(validateActivityForm(form({ type: 'skydiving' }), NOW_S, TZ)).toEqual({ ok: false, error: 'type' });
    expect(validateActivityForm(form({ date: '2026-02-30' }), NOW_S, TZ)).toEqual({ ok: false, error: 'date' });
    expect(validateActivityForm(form({ startTime: '25:00' }), NOW_S, TZ)).toEqual({ ok: false, error: 'start' });
    expect(validateActivityForm(form({ endTime: '7.45' }), NOW_S, TZ)).toEqual({ ok: false, error: 'end' });
  });

  it('requires the end after the start, in the past, and within limits', () => {
    expect(validateActivityForm(form({ endTime: '06:59' }), NOW_S, TZ)).toEqual({ ok: false, error: 'endBeforeStart' });
    expect(validateActivityForm(form({ endTime: '07:00' }), NOW_S, TZ)).toEqual({ ok: false, error: 'endBeforeStart' });
    expect(validateActivityForm(form({ date: '2026-11-25', startTime: '11:00', endTime: '13:00' }), NOW_S, TZ)).toEqual({ ok: false, error: 'future' });
    expect(validateActivityForm(form({ note: 'x'.repeat(501) }), NOW_S, TZ)).toEqual({ ok: false, error: 'note' });
  });

  it('parses clocks and route ids strictly', () => {
    expect(parseClock('7:05')).toBe(7 * 3600 + 300);
    expect(parseClock('07:60')).toBeNull();
    expect(parseIdParam('12')).toBe(12);
    expect(parseIdParam('0')).toBeNull();
    expect(parseIdParam(['12'])).toBeNull();
    expect(parseIdParam('1e3')).toBeNull();
  });

  it('builds a default form ending now', () => {
    const f = defaultForm('yoga', NOW_S, TZ);
    expect(f).toEqual({ type: 'yoga', date: '2026-11-25', startTime: '11:00', endTime: '12:00', note: '' });
    expect(validateActivityForm(f, NOW_S, TZ).ok).toBe(true);
  });
});

describe('day entries', () => {
  it('lists own activities on their day next to detected workouts', () => {
    const day = lastDay();
    const entries = dayEntries(days, day, [activity()]);
    expect(entries.some((e) => e.key === 'a:7' && e.kind === 'manual' && e.type === 'cycling')).toBe(true);
    expect(entries.length).toBe(day.workouts.length + 1);
    expect(dayOfActivity(days, day.start + 10)?.day).toBe(day.day);
  });

  it('applies edits and deletions of a detected workout without touching the record', () => {
    const day = dayWithWorkout();
    const workout = day.workouts.find((w) => w.source === 'auto');
    if (workout === undefined) throw new Error('no detected workout');
    const edited = activity({ id: 9, source: 'auto', detectedStart: workout.start, type: 'padel', start: workout.start, end: workout.end });
    expect(dayEntries(days, day, [edited]).find((e) => e.detectedStart === workout.start)).toMatchObject({ kind: 'edited', type: 'padel', id: 9 });
    expect(dayEntries(days, day, [{ ...edited, deletedAt: 5 }]).some((e) => e.detectedStart === workout.start)).toBe(false);
    expect(entryForWorkout([{ ...edited, deletedAt: 5 }], workout)).toBeNull();
    expect(entryForWorkout([], workout)).toMatchObject({ kind: 'detected', hasLoad: false });
    expect(day.workouts).toContain(workout);
  });

  it('shows one entry when a logged activity covers a detected workout, and counts the overlap once', () => {
    const day = dayWithWorkout();
    const workout = day.workouts.find((w) => w.source === 'auto');
    if (workout === undefined) throw new Error('no detected workout');
    const logged = activity({ id: 11, start: workout.start - 300, end: workout.end + 300 });
    const entries = dayEntries(days, day, [logged]);
    expect(entries.some((e) => e.key === `w:${workout.start}`)).toBe(false);
    expect(entries.some((e) => e.key === 'a:11')).toBe(true);
    const partial = activity({ id: 12, start: workout.end - 60, end: workout.end + 1800 });
    const both = dayEntries(days, day, [partial]).filter((e) => e.key === 'a:12' || e.key === `w:${workout.start}`);
    expect(both).toHaveLength(2);
    expect(dayTotals(both).seconds).toBe(partial.end - workout.start);
  });

  it('hides deleted own activities and finds them by id', () => {
    expect(entryById([activity({ deletedAt: 3 })], 7)).toBeNull();
    expect(entryById([activity({ source: 'live' })], 7)).toMatchObject({ kind: 'live', hasLoad: true });
    expect(dayEntries(days, lastDay(), [activity({ deletedAt: 3 })]).some((e) => e.id === 7)).toBe(false);
  });
});

describe('live session', () => {
  const T = 1_800_000_000;

  function run(events: Parameters<typeof liveReducer>[1][]): LiveSession {
    return events.reduce(liveReducer, IDLE_SESSION);
  }

  it('starts, pauses, resumes and stops with the paused time left out', () => {
    const s = run([
      { kind: 'start', at: T },
      { kind: 'pause', at: T + 60 },
      { kind: 'beat', at: T + 70, hr: 150 },
      { kind: 'resume', at: T + 120 },
      { kind: 'stop', at: T + 300 },
    ]);
    expect(s).toMatchObject({ phase: 'stopped', startedAt: T, endedAt: T + 300, paused: [{ start: T + 60, end: T + 120 }], points: [] });
    expect(activeSeconds(s, T + 999)).toBe(240);
  });

  it('closes an open pause on stop and while measuring', () => {
    const paused = run([{ kind: 'start', at: T }, { kind: 'pause', at: T + 100 }]);
    expect(sessionWindow(paused, T + 160)).toEqual({ window: { start: T, end: T + 160 }, paused: [{ start: T + 100, end: T + 160 }] });
    expect(activeSeconds(paused, T + 160)).toBe(100);
    expect(liveReducer(paused, { kind: 'stop', at: T + 200 }).paused).toEqual([{ start: T + 100, end: T + 200 }]);
  });

  it('keeps one beat per second and ignores beats outside a running session', () => {
    const s = run([
      { kind: 'beat', at: T, hr: 100 },
      { kind: 'start', at: T },
      { kind: 'beat', at: T + 1.2, hr: 120 },
      { kind: 'beat', at: T + 1.8, hr: 122 },
      { kind: 'beat', at: T + 2, hr: 0 },
      { kind: 'beat', at: T + 3, hr: 125 },
    ]);
    expect(s.points).toEqual([
      { t: T + 1, hr: 122 },
      { t: T + 3, hr: 125 },
    ]);
    expect(liveReducer(s, { kind: 'start', at: T + 9 })).toBe(s);
    expect(liveReducer(IDLE_SESSION, { kind: 'stop', at: T })).toBe(IDLE_SESSION);
  });

  it('computes running load, zone and the projected day load', () => {
    let s = liveReducer(IDLE_SESSION, { kind: 'start', at: T });
    for (let i = 0; i < 600; i++) s = liveReducer(s, { kind: 'beat', at: T + i, hr: 160 });
    const ref = { rest: 60, max: 190 };
    const today = { ...lastDay(), end: T, load: { value: 8, reason: null, coverage: 1, algo: 'x' } };
    const hud = hudFor(s, T + 600, 160, ref, today);
    expect(hud.activeS).toBe(600);
    expect(hud.load).toBeGreaterThan(0);
    expect(hud.zone).toBe(3);
    expect(hud.avgHr).toBe(160);
    expect(hud.projectedDayLoad).toBeGreaterThan(8);
    expect(hudFor(s, T + 600, null, ref, null)).toMatchObject({ zone: null, projectedDayLoad: null });
    expect(hudFor(IDLE_SESSION, T, 160, ref, today)).toMatchObject({ activeS: 0, load: null, zone: 3 });
  });
});

describe('add activity screen', () => {
  it('validates and saves a manual activity', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
    const saveActivity = jest.fn(async () => 42);
    await render(withAppData(<AddActivityScreen />, 'en', { saveActivity }));
    await fireEvent.press(screen.getByTestId('activity-type-running'));
    expect(screen.getByTestId('form-type-running').props.accessibilityState).toEqual({ selected: true });
    const tz = deviceTzOffsetS(FIXTURE_NOW);
    const today = unixToIsoDate(NOW_S, tz);
    await fireEvent.changeText(screen.getByTestId('form-date'), today);
    await fireEvent.changeText(screen.getByTestId('form-start'), '08:00');
    await fireEvent.changeText(screen.getByTestId('form-end'), '07:00');
    await fireEvent.press(screen.getByTestId('form-save'));
    expect(screen.getByTestId('form-error')).toHaveTextContent('The end must be after the start on the same day.');
    expect(saveActivity).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('form-date'), '2026-11-20');
    await fireEvent.changeText(screen.getByTestId('form-end'), '09:00');
    await fireEvent.changeText(screen.getByTestId('form-note'), 'long ride');
    await fireEvent.press(screen.getByTestId('form-type-cycling'));
    await fireEvent.press(screen.getByTestId('form-save'));
    const start = Date.UTC(2026, 10, 20, 8, 0) / 1000 - tz;
    await waitFor(() =>
      expect(saveActivity).toHaveBeenCalledWith({ source: 'manual', detectedStart: null, type: 'cycling', start, end: start + 3600, paused: [], note: 'long ride' }),
    );
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/activity/details', params: { id: '42' } });
    jest.restoreAllMocks();
  });

  it('shows the reason when saving fails', async () => {
    const saveActivity = jest.fn(async () => null);
    await render(withAppData(<AddActivityScreen />, 'en', { saveActivity, notice: { key: 'activity.error.noBand' } }));
    await fireEvent.press(screen.getByTestId('activity-type-yoga'));
    await fireEvent.press(screen.getByTestId('form-save'));
    expect(await screen.findByTestId('form-failed')).toHaveTextContent(/Pair a band/);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('activity details, edit and delete with undo', () => {
  it('shows the load and zones of an own activity', async () => {
    mockParams = { id: '7' };
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity({ note: 'hills' })] }));
    expect(screen.getByTestId('detail-load')).toHaveTextContent(/6\.2/);
    expect(screen.getByTestId('detail-note')).toHaveTextContent('hills');
    expect(screen.queryByTestId('detail-no-load')).toBeNull();
  });

  it('explains a missing load instead of showing a number', async () => {
    mockParams = { id: '7' };
    const empty = activity({ metrics: { activeS: 1800, load: null, loadReason: 'no-data', zoneSeconds: [0, 0, 0, 0, 0, 0], avgHr: null, maxHr: null, hrSeconds: 0 } });
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [empty] }));
    expect(screen.getByTestId('detail-load')).toHaveTextContent(/No data/);
    expect(screen.getByTestId('detail-no-load')).toHaveTextContent(/no heart rate/);
  });

  it('edits an own activity in place', async () => {
    mockParams = { id: '7' };
    const saveActivity = jest.fn(async () => 7);
    const row = activity({ source: 'live', paused: [{ start: activity().start + 60, end: activity().start + 120 }] });
    await render(withAppData(<EditActivityScreen />, 'en', { activities: [row], saveActivity }));
    await fireEvent.press(screen.getByTestId('form-type-running'));
    await fireEvent.changeText(screen.getByTestId('form-note'), 'felt good');
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() =>
      expect(saveActivity).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'live', detectedStart: null, type: 'running', note: 'felt good', paused: row.paused, start: row.start, end: row.end }),
        7,
      ),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('stores an edit of a detected workout as an override', async () => {
    const day = dayWithWorkout();
    const index = day.workouts.findIndex((w) => w.source === 'auto');
    const workout = day.workouts[index];
    mockParams = { day: day.day, index: String(index) };
    const saveActivity = jest.fn(async () => 3);
    await render(withAppData(<EditActivityScreen />, 'en', { saveActivity }));
    expect(screen.getByTestId('edit-detected-note')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('form-type-football'));
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() =>
      expect(saveActivity).toHaveBeenCalledWith(expect.objectContaining({ source: 'auto', detectedStart: workout?.start, type: 'football' }), undefined),
    );
  });

  it('deletes an own activity and offers undo on the Load screen', async () => {
    mockParams = { id: '7' };
    const deleteActivity = jest.fn(async () => true);
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity()], deleteActivity }));
    await fireEvent.press(screen.getByTestId('detail-delete'));
    await waitFor(() => expect(deleteActivity).toHaveBeenCalledWith({ kind: 'activity', id: 7 }));
    expect(router.back).toHaveBeenCalled();

    const undoDelete = jest.fn(async () => undefined);
    await render(withAppData(<LoadScreen />, 'en', { activities: [activity({ deletedAt: 1 })], pendingDelete: { id: 7, until: Date.now() + 4000 }, undoDelete }));
    expect(screen.getByTestId('undo-bar')).toHaveTextContent(/Activity deleted/);
    expect(screen.queryByTestId('entry-a:7')).toBeNull();
    await fireEvent.press(screen.getByTestId('undo-delete'));
    expect(undoDelete).toHaveBeenCalled();
  });

  it('deletes a detected workout by storing the deletion', async () => {
    const day = dayWithWorkout();
    const index = day.workouts.findIndex((w) => w.source === 'auto');
    mockParams = { day: day.day, index: String(index) };
    const deleteActivity = jest.fn(async () => true);
    await render(withAppData(<EditActivityScreen />, 'en', { deleteActivity }));
    await fireEvent.press(screen.getByTestId('edit-delete'));
    await waitFor(() => expect(deleteActivity).toHaveBeenCalledWith({ kind: 'detected', workout: day.workouts[index] }));
  });

  it('shows the undo bar on a details screen whose activity was just deleted', async () => {
    mockParams = { id: '7' };
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity({ deletedAt: 1 })], pendingDelete: { id: 7, until: Date.now() + 4000 } }));
    expect(screen.getByTestId('activity-deleted')).toBeTruthy();
    expect(screen.getByTestId('undo-bar')).toBeTruthy();
  });

  it('lists own activities with their load on the Load screen', async () => {
    await render(withAppData(<LoadScreen />, 'en', { activities: [activity()] }));
    expect(screen.getByTestId('entry-a:7')).toHaveTextContent(/Load 6\.2/);
  });
});

describe('live activity screen', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs, pauses and saves a live session with its pauses', async () => {
    let nowMs = FIXTURE_NOW.getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    mockParams = { type: 'running' };
    const startLive = jest.fn(async () => undefined);
    const stopLive = jest.fn(async () => undefined);
    const saveActivity = jest.fn(async () => 55);
    const base = { profile: { birthYear: null, maxHeartRate: 200 }, startLive, stopLive, saveActivity };
    const view = await render(withAppData(<LiveActivityScreen />, 'en', { ...base, live: { active: true, heartRate: null, lastRrMs: null, updatedAt: null } }));
    await fireEvent.press(screen.getByTestId('live-begin'));
    await waitFor(() => expect(startLive).toHaveBeenCalled());
    const start = Math.floor(nowMs / 1000);
    for (let i = 1; i <= 40; i++) {
      nowMs += 1000;
      await act(async () => {
        await view.rerender(withAppData(<LiveActivityScreen />, 'en', { ...base, live: { active: true, heartRate: 150, lastRrMs: 400, updatedAt: nowMs } }));
      });
    }
    expect(screen.getByTestId('live-avg')).toHaveTextContent(/150/);
    expect(screen.getByTestId('live-target')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('live-pause'));
    nowMs += 20_000;
    await fireEvent.press(screen.getByTestId('live-resume'));
    nowMs += 60_000;
    await fireEvent.press(screen.getByTestId('live-stop'));
    await waitFor(() => expect(stopLive).toHaveBeenCalled());
    await waitFor(() =>
      expect(saveActivity).toHaveBeenCalledWith({
        source: 'live',
        detectedStart: null,
        type: 'running',
        start,
        end: start + 120,
        paused: [{ start: start + 40, end: start + 60 }],
        note: null,
      }),
    );
    expect(await screen.findByTestId('live-saved')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('live-view'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/activity/details', params: { id: '55' } });
  });

  it('shows progress toward the load target when today has a Load', async () => {
    const latest = lastDay();
    jest.spyOn(Date, 'now').mockReturnValue(latest.end * 1000);
    await render(withAppData(<LiveActivityScreen />, 'en', { profile: { birthYear: null, maxHeartRate: 200 } }));
    const isToday = latest.day === unixToIsoDate(latest.end, deviceTzOffsetS(new Date(latest.end * 1000))) && latest.load.value !== null;
    if (isToday) expect(screen.getByTestId('live-target-value')).toHaveTextContent(new RegExp(String(latest.load.value).replace('.', '\\.')));
    else expect(screen.getByTestId('live-target')).toBeTruthy();
  });
});
