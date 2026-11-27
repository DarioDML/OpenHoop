import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { DayRecord, SleepEditRow, SleepPeriodRecord } from '@openhoop/core';
import type { ReactNode } from 'react';

import { createFixtureDays } from '@/data/fixtureSource';
import {
  clockTimeOnDay,
  draftTimes,
  editableSleeps,
  nearestClockTime,
  otherSleepSpans,
  parseClock,
  recomputeFrom,
  type EditableSleep,
  type SleepEditRequest,
} from '@/data/sleepEditForm';
import type { SleepEditOutcome } from '@/data/types';
import { formatClock } from '@/lib/format';

import { FIXTURE_NOW, withAppData } from './support/appData';

let mockParams: Record<string, string | string[] | undefined> = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import EditSleepScreen from '@/app/sleep/edit';
import { dragTo, handleLefts, relative, snap, timelineWindow } from '@/ui/sleep/Timeline24';
import LastNightScreen from '@/app/sleep/last-night';

const HOUR_S = 3_600;
const DAY_S = 86_400;
const TZ = 3_600;
const MIDNIGHT = Date.UTC(2026, 10, 25) / 1000 - TZ;

function period(overrides: Partial<SleepPeriodRecord>): SleepPeriodRecord {
  return { onset: MIDNIGHT - HOUR_S, offset: MIDNIGHT + 7 * HOUR_S - 1, asleepS: 7 * HOUR_S, inBedS: 8 * HOUR_S, nap: false, source: 'detected', editId: null, ...overrides };
}

function withPeriods(day: DayRecord, periods: SleepPeriodRecord[]): DayRecord {
  return { ...day, tzOffsetS: TZ, day: '2026-11-25', sleep: { ...day.sleep, periods } };
}

const fixtures = createFixtureDays(FIXTURE_NOW);
const base = fixtures[fixtures.length - 1];
if (base === undefined) throw new Error('no fixture day');

const nightPeriod = period({});
const napPeriod = period({ onset: MIDNIGHT + 14 * HOUR_S, offset: MIDNIGHT + 14.5 * HOUR_S - 1, asleepS: 1_500, inBedS: 1_800, nap: true });
const plainDay = withPeriods(base, [nightPeriod, napPeriod]);

function itemOf(day: DayRecord, kind: EditableSleep['kind'], edits: SleepEditRow[] = []): EditableSleep {
  const item = editableSleeps(day, edits).find((i) => i.kind === kind);
  if (item === undefined) throw new Error(`no ${kind}`);
  return item;
}

describe('sleepEditForm', () => {
  it('parses 24-hour clock times', () => {
    expect(parseClock('07:30')).toBe(450);
    expect(parseClock(' 7.05 ')).toBe(425);
    expect(parseClock('23:59')).toBe(1_439);
    for (const bad of ['24:00', '7', '07:60', 'ab:cd', '']) expect(parseClock(bad)).toBeNull();
  });

  it('places a clock time nearest to a reference, across midnight', () => {
    expect(nearestClockTime(22 * 60, MIDNIGHT - HOUR_S, TZ)).toBe(MIDNIGHT - 2 * HOUR_S);
    expect(nearestClockTime(60, MIDNIGHT - HOUR_S, TZ)).toBe(MIDNIGHT + HOUR_S);
    expect(nearestClockTime(6 * 60, MIDNIGHT + 7 * HOUR_S, TZ)).toBe(MIDNIGHT + 6 * HOUR_S);
    expect(clockTimeOnDay('2026-11-25', 14 * 60, TZ)).toBe(MIDNIGHT + 14 * HOUR_S);
    expect(clockTimeOnDay('2026-02-30', 0, TZ)).toBeNull();
  });

  it('lists the night as one item and each nap, with exclusive ends', () => {
    const items = editableSleeps(plainDay, []);
    expect(items).toEqual([
      { key: `night-${nightPeriod.onset}`, kind: 'night', onset: nightPeriod.onset, offset: MIDNIGHT + 7 * HOUR_S, asleepS: 7 * HOUR_S, source: 'detected', editId: null, targetOnset: nightPeriod.onset, targetOffset: nightPeriod.offset },
      { key: `nap-${napPeriod.onset}`, kind: 'nap', onset: napPeriod.onset, offset: MIDNIGHT + 14.5 * HOUR_S, asleepS: 1_500, source: 'detected', editId: null, targetOnset: napPeriod.onset, targetOffset: napPeriod.offset },
    ]);
  });

  it('joins a split night and keeps the original target of an edited night', () => {
    const split = withPeriods(base, [period({ offset: MIDNIGHT + 2 * HOUR_S - 1, asleepS: 3 * HOUR_S }), period({ onset: MIDNIGHT + 3 * HOUR_S, asleepS: 4 * HOUR_S })]);
    expect(itemOf(split, 'night')).toMatchObject({ onset: MIDNIGHT - HOUR_S, offset: MIDNIGHT + 7 * HOUR_S, asleepS: 7 * HOUR_S, targetOffset: MIDNIGHT + 7 * HOUR_S - 1 });

    const edit: SleepEditRow = { id: 4, deviceId: 1, targetOnset: 10, targetOffset: 20, onset: MIDNIGHT - 2 * HOUR_S, offset: MIDNIGHT + 7 * HOUR_S, createdAt: 1 };
    const edited = withPeriods(base, [period({ onset: edit.onset, offset: edit.offset, source: 'edited', editId: 4 })]);
    expect(itemOf(edited, 'night', [edit])).toMatchObject({ source: 'edited', editId: 4, targetOnset: 10, targetOffset: 20, offset: edit.offset });

    const manual = withPeriods(base, [period({ onset: MIDNIGHT + 15 * HOUR_S, offset: MIDNIGHT + 16 * HOUR_S, nap: true, source: 'manual', editId: 9 })]);
    expect(itemOf(manual, 'nap')).toMatchObject({ source: 'manual', editId: 9, targetOnset: null, targetOffset: null });
  });

  it('keeps an unchanged time exactly and resolves a changed one near the original', () => {
    const night = itemOf(plainDay, 'night');
    const same = draftTimes(night, plainDay.day, TZ, formatClock(night.onset, TZ), formatClock(night.offset, TZ));
    expect(same).toEqual({ ok: true, onset: night.onset, offset: night.offset });
    expect(draftTimes(night, plainDay.day, TZ, '22:30', '06:45')).toEqual({ ok: true, onset: MIDNIGHT - 1.5 * HOUR_S, offset: MIDNIGHT + 6.75 * HOUR_S });
    expect(draftTimes(null, plainDay.day, TZ, '13:00', '13:40')).toEqual({ ok: true, onset: MIDNIGHT + 13 * HOUR_S, offset: MIDNIGHT + 13 * HOUR_S + 2_400 });
    expect(draftTimes(null, plainDay.day, TZ, '13:00', 'later')).toEqual({ ok: false, problem: 'invalid-time' });
  });

  it('collects the other sleeps, leaving out the one being replaced', () => {
    const edits: SleepEditRow[] = [{ id: 2, deviceId: 1, targetOnset: null, targetOffset: null, onset: MIDNIGHT + 20 * HOUR_S, offset: MIDNIGHT + 21 * HOUR_S, createdAt: 1 }];
    const night = itemOf(plainDay, 'night');
    expect(otherSleepSpans([plainDay], edits, { id: null, replaces: { onset: night.onset, offset: night.offset } })).toEqual([
      { onset: napPeriod.onset, offset: napPeriod.offset + 1 },
      { onset: MIDNIGHT + 20 * HOUR_S, offset: MIDNIGHT + 21 * HOUR_S },
    ]);
    expect(otherSleepSpans([plainDay], edits, { id: 2, replaces: null })).toHaveLength(2);

    const napInNight: SleepEditRow = { id: 5, deviceId: 1, targetOnset: null, targetOffset: null, onset: MIDNIGHT + HOUR_S, offset: MIDNIGHT + 2 * HOUR_S, createdAt: 1 };
    const withNap = withPeriods(base, [nightPeriod, period({ onset: napInNight.onset, offset: napInNight.offset, nap: true, source: 'manual', editId: 5 })]);
    expect(otherSleepSpans([withNap], [napInNight], { id: null, replaces: { onset: night.onset, offset: night.offset } })).toEqual([
      { onset: napInNight.onset, offset: napInNight.offset },
      { onset: napInNight.onset, offset: napInNight.offset },
    ]);
  });

  it('recomputes from a day before the earliest affected time', () => {
    const request = { onset: MIDNIGHT, targetOnset: MIDNIGHT - HOUR_S };
    expect(recomputeFrom(request, null)).toBe(MIDNIGHT - HOUR_S - DAY_S);
    const previous: SleepEditRow = { id: 1, deviceId: 1, targetOnset: MIDNIGHT - HOUR_S, targetOffset: MIDNIGHT, onset: MIDNIGHT - 3 * HOUR_S, offset: MIDNIGHT, createdAt: 1 };
    expect(recomputeFrom(request, previous)).toBe(MIDNIGHT - 3 * HOUR_S - DAY_S);
  });
});

describe('Edit sleep screen', () => {
  beforeEach(() => {
    mockParams = {};
  });

  function renderEdit(days: DayRecord[], overrides: { sleepEdits?: SleepEditRow[]; save?: jest.Mock; remove?: jest.Mock } = {}) {
    const save = overrides.save ?? jest.fn(async (): Promise<SleepEditOutcome> => 'saved');
    const remove = overrides.remove ?? jest.fn(async () => true);
    const tree = withAppData(<EditSleepScreen />, 'en', { days, sleepEdits: overrides.sleepEdits ?? [], saveSleepEdit: save, deleteSleepEdit: remove });
    return { save, remove, tree };
  }

  it('corrects the night and sends the detected night as the target', async () => {
    const { save, tree } = renderEdit([plainDay]);
    await render(tree);
    const night = itemOf(plainDay, 'night');
    await fireEvent.press(screen.getByTestId(`edit-item-${night.key}`));
    expect(screen.getByTestId('edit-start').props.value).toBe(formatClock(night.onset, TZ));
    await fireEvent.changeText(screen.getByTestId('edit-start'), '22:30');
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.getByTestId('edit-status')).toBeTruthy());
    const expected: SleepEditRequest = {
      id: null,
      targetOnset: nightPeriod.onset,
      targetOffset: nightPeriod.offset,
      onset: MIDNIGHT - 1.5 * HOUR_S,
      offset: MIDNIGHT + 7 * HOUR_S,
      replaces: { onset: night.onset, offset: night.offset },
    };
    expect(save).toHaveBeenCalledWith(expected);
    expect(screen.getByText('Saved. Your days are recomputed.')).toBeTruthy();
    expect(screen.getByTestId('edit-start').props.value).toBe(formatClock(night.onset, TZ));
  });

  it('shows the problem the controller reports and keeps the form open', async () => {
    const { tree } = renderEdit([plainDay], { save: jest.fn(async (): Promise<SleepEditOutcome> => 'overlap') });
    await render(tree);
    await fireEvent.press(screen.getByText('Add nap'));
    await fireEvent.changeText(screen.getByTestId('edit-start'), '14:10');
    await fireEvent.changeText(screen.getByTestId('edit-end'), '14:40');
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.getByTestId('edit-problem')).toBeTruthy());
    expect(screen.getByText('These times overlap another sleep.')).toBeTruthy();
    expect(screen.getByTestId('edit-form')).toBeTruthy();
  });

  it('adds a nap by hand on the shown day and names the nap limit when it is too long', async () => {
    const save = jest.fn(async (): Promise<SleepEditOutcome> => 'too-long');
    const { tree } = renderEdit([plainDay], { save });
    await render(tree);
    await fireEvent.press(screen.getByText('Add nap'));
    await fireEvent.changeText(screen.getByTestId('edit-start'), '09:00');
    await fireEvent.changeText(screen.getByTestId('edit-end'), '14:00');
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.getByText('A nap can last at most 4 hours.')).toBeTruthy());
    expect(save).toHaveBeenCalledWith({ id: null, targetOnset: null, targetOffset: null, onset: MIDNIGHT + 9 * HOUR_S, offset: MIDNIGHT + 14 * HOUR_S, replaces: null });
  });

  it('rejects a time it cannot read without saving', async () => {
    const { save, tree } = renderEdit([plainDay]);
    await render(tree);
    await fireEvent.press(screen.getByText('Add nap'));
    await fireEvent.changeText(screen.getByTestId('edit-start'), '9');
    await fireEvent.changeText(screen.getByTestId('edit-end'), '10:00');
    await fireEvent.press(screen.getByTestId('edit-save'));
    expect(screen.getByText('Enter both times as hours and minutes, for example 07:30.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('labels an edited night, shows the detected times and restores them', async () => {
    const edit: SleepEditRow = { id: 7, deviceId: 1, targetOnset: nightPeriod.onset, targetOffset: nightPeriod.offset, onset: MIDNIGHT - 2 * HOUR_S, offset: MIDNIGHT + 7 * HOUR_S, createdAt: 1 };
    const edited = withPeriods(base, [period({ onset: edit.onset, offset: edit.offset, source: 'edited', editId: 7 }), period({ ...napPeriod, source: 'manual', editId: 8 })]);
    const { remove, tree } = renderEdit([edited], { sleepEdits: [edit] });
    await render(tree);
    expect(within(screen.getByTestId('edit-list')).getByText('Edited')).toBeTruthy();
    expect(within(screen.getByTestId('edit-list')).getByText('Added by hand')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`edit-item-night-${edit.onset}`));
    expect(screen.getByTestId('edit-detected').props.children).toBe(`Detected ${formatClock(nightPeriod.onset, TZ)} – ${formatClock(nightPeriod.offset, TZ)}`);
    await fireEvent.press(screen.getByTestId('edit-revert'));
    expect(remove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('edit-delete-confirm'));
    await waitFor(() => expect(screen.getByText('Detected times restored.')).toBeTruthy());
    expect(remove).toHaveBeenCalledWith(7);
  });

  it('deletes a nap added by hand', async () => {
    const manual = withPeriods(base, [nightPeriod, period({ ...napPeriod, source: 'manual', editId: 8 })]);
    const { remove, tree } = renderEdit([manual]);
    await render(tree);
    await fireEvent.press(screen.getByTestId(`edit-item-nap-${napPeriod.onset}`));
    expect(screen.queryByTestId('edit-detected')).toBeNull();
    expect(screen.getByText('Delete this sleep')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('edit-revert'));
    expect(screen.getByTestId('edit-delete-confirm-card')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('edit-delete-confirm'));
    await waitFor(() => expect(screen.getByText('Nap deleted.')).toBeTruthy());
    expect(remove).toHaveBeenCalledWith(8);
  });

  it('moves between days and offers a nap on a day without sleep', async () => {
    const empty = { ...withPeriods(base, []), day: '2026-11-24' };
    const { tree } = renderEdit([empty, plainDay]);
    await render(tree);
    expect(screen.queryByTestId('edit-none')).toBeNull();
    await fireEvent.press(screen.getByTestId('edit-prev-day'));
    expect(screen.getByTestId('edit-none')).toBeTruthy();
    expect(screen.getByTestId('edit-prev-day').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('opens the day from the route and refuses an invalid one', async () => {
    mockParams = { day: 'nope' };
    await render(renderEdit([plainDay]).tree);
    expect(screen.getByText('That is not a valid day.')).toBeTruthy();
  });

  it('renders in Dutch', async () => {
    await render(withAppData(<EditSleepScreen />, 'nl', { days: [plainDay] }));
    expect(screen.getByText('Dutje toevoegen')).toBeTruthy();
    expect(within(screen.getByTestId('edit-list')).getByText('Nacht')).toBeTruthy();
  });
});

describe('Last night labels', () => {
  it('marks an edited night and a nap added by hand, and links to the edit screen', async () => {
    const edited = withPeriods(base, [period({ source: 'edited', editId: 3 }), period({ ...napPeriod, source: 'manual', editId: 4 })]);
    mockParams = { day: edited.day };
    await render(withAppData(<LastNightScreen />, 'en', { days: [edited] }));
    expect(screen.getByTestId('night-edited')).toBeTruthy();
    expect(screen.getByText('Added by hand')).toBeTruthy();
    expect(screen.getByTestId('link-edit-sleep')).toBeTruthy();
  });
});

describe('Edit sleep timeline', () => {
  beforeEach(() => {
    mockParams = {};
  });

  it('opens on the night, drags the handles in five-minute steps and keeps the fields in sync', async () => {
    const save = jest.fn(async (): Promise<SleepEditOutcome> => 'saved');
    await render(withAppData(<EditSleepScreen />, 'en', { days: [plainDay], saveSleepEdit: save }));
    const night = itemOf(plainDay, 'night');
    expect(screen.getByTestId('edit-start').props.value).toBe(formatClock(night.onset, TZ));
    await fireEvent(screen.getByTestId('edit-timeline'), 'layout', { nativeEvent: { layout: { width: 288, height: 72, x: 0, y: 0 } } });
    await fireEvent(screen.getByTestId('edit-timeline-start'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.getByTestId('edit-start').props.value).toBe('22:55');
    await fireEvent(screen.getByTestId('edit-timeline-end'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('edit-end').props.value).toBe('07:05');
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ onset: MIDNIGHT - HOUR_S - 300, offset: MIDNIGHT + 7 * HOUR_S + 300 })));
  });

  it('moves the bar when a time is typed and refuses to delete a detected night', async () => {
    await render(withAppData(<EditSleepScreen />, 'en', { days: [plainDay] }));
    await fireEvent(screen.getByTestId('edit-timeline'), 'layout', { nativeEvent: { layout: { width: 288, height: 72, x: 0, y: 0 } } });
    await fireEvent.changeText(screen.getByTestId('edit-start'), '22:00');
    expect(screen.getByTestId('edit-timeline-start').props.accessibilityValue).toEqual({ text: '22:00' });
    expect(screen.getByTestId('edit-revert').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('edit-delete-detected')).toBeTruthy();
    expect(screen.getByTestId('edit-recalc')).toHaveTextContent(/Recalculated from raw data/);
  });
});

describe('timeline drag maths', () => {
  it('measures from the window start, snaps to five minutes and keeps the handles apart', () => {
    expect(relative(23 * 60, 720)).toBe(660);
    expect(relative(7 * 60, 720)).toBe(1140);
    expect(snap(662)).toBe(660);
    expect(snap(663)).toBe(665);
    expect(dragTo('start', 660, 1140, 1200)).toBe(1135);
    expect(dragTo('start', 660, 1140, -40)).toBe(0);
    expect(dragTo('end', 660, 1140, 500)).toBe(665);
    expect(dragTo('end', 660, 1140, 1600)).toBe(1440);
  });
});

describe('timeline window', () => {
  beforeEach(() => {
    mockParams = {};
  });

  it('starts three whole hours before the item and moves only when a typed range does not fit', () => {
    expect(timelineWindow(23 * 60 + 14, 23 * 60 + 14, 6 * 60 + 52)).toBe(20 * 60);
    expect(timelineWindow(8 * 60 + 30, 8 * 60 + 30, 16 * 60)).toBe(5 * 60);
    expect(timelineWindow(23 * 60 + 30, 23 * 60 + 30, 30)).toBe(20 * 60);
    expect(timelineWindow(60, 60, 9 * 60)).toBe(22 * 60);
    expect(timelineWindow(23 * 60, 17 * 60, 22 * 60)).toBe(14 * 60);
    expect(timelineWindow(23 * 60, null, null)).toBe(20 * 60);
  });

  it('keeps the two handles apart even at the smallest gap', () => {
    const lefts = handleLefts(100, 101, 288);
    expect(lefts.end - lefts.start).toBeGreaterThanOrEqual(24);
    expect(handleLefts(0, 300, 288)).toEqual({ start: 0, end: 264 });
  });

  it('shows the handles for someone who sleeps by day', async () => {
    const daySleep = withPeriods(base, [period({ onset: MIDNIGHT + 8 * HOUR_S, offset: MIDNIGHT + 16 * HOUR_S - 1 })]);
    await render(withAppData(<EditSleepScreen />, 'en', { days: [daySleep] }));
    await fireEvent(screen.getByTestId('edit-timeline'), 'layout', { nativeEvent: { layout: { width: 288, height: 72, x: 0, y: 0 } } });
    expect(screen.getByTestId('edit-timeline-start').props.accessibilityValue).toEqual({ text: '08:00' });
    expect(screen.getByTestId('edit-timeline-end').props.accessibilityValue).toEqual({ text: '16:00' });
    expect(screen.getAllByText('05:00')).toHaveLength(2);
  });

  it('seeds a nap so it can be added by dragging', async () => {
    const save = jest.fn(async (): Promise<SleepEditOutcome> => 'saved');
    await render(withAppData(<EditSleepScreen />, 'en', { days: [plainDay], saveSleepEdit: save }));
    await fireEvent.press(screen.getByText('Add nap'));
    await fireEvent(screen.getByTestId('edit-timeline'), 'layout', { nativeEvent: { layout: { width: 288, height: 72, x: 0, y: 0 } } });
    expect(screen.getByTestId('edit-start').props.value).toBe('14:00');
    expect(screen.getByTestId('edit-end').props.value).toBe('14:30');
    await fireEvent(screen.getByTestId('edit-timeline-end'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('edit-end').props.value).toBe('14:35');
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ id: null, targetOnset: null, targetOffset: null, onset: MIDNIGHT + 14 * HOUR_S, offset: MIDNIGHT + 14 * HOUR_S + 35 * 60, replaces: null }));
  });
});
