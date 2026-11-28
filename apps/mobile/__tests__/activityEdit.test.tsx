import type { ActivityRow } from '@openhoop/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { dragRange, formRange, localUnix, rangeWindow, withRange, type ActivityForm } from '@/data/activities';
import { createFixtureDays } from '@/data/fixtureSource';

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

import EditActivityScreen from '@/app/activity/edit';

const days = createFixtureDays(FIXTURE_NOW);
const DAY = Date.UTC(2026, 10, 24) / 1000;
const at = (h: number, m: number): number => DAY + h * 3600 + m * 60;

function previousDay() {
  const day = days[days.length - 2];
  if (day === undefined) throw new Error('fixture has no days');
  return day;
}

function activity(over: Partial<ActivityRow> = {}): ActivityRow {
  const day = previousDay();
  const start = localUnix(day.day, 18 * 3600 + 5 * 60, day.tzOffsetS) ?? day.start;
  return {
    id: 7,
    deviceId: 1,
    source: 'manual',
    detectedStart: null,
    type: 'running',
    start,
    end: start + 42 * 60,
    paused: [],
    note: null,
    deletedAt: null,
    metrics: { activeS: 2520, load: 8, loadReason: null, zoneSeconds: [0, 0, 0, 0, 0, 0], avgHr: 140, maxHr: 170, hrSeconds: 2520, activeMinutes: null },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function touch(x: number, timestamp: number) {
  return {
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timestamp,
      touchBank: [
        { touchActive: true, startPageX: 0, startPageY: 0, startTimeStamp: 1, currentPageX: x, currentPageY: 0, currentTimeStamp: timestamp, previousPageX: 0, previousPageY: 0, previousTimeStamp: 1 },
      ],
    },
  };
}

async function layoutSlider(): Promise<void> {
  await fireEvent(screen.getByTestId('edit-slider'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 324, height: 64 } } });
}

beforeEach(() => {
  mockParams = { id: '7' };
  jest.clearAllMocks();
});

describe('time range helpers', () => {
  it('frames the activity on half hours with a little room on both sides', () => {
    expect(rangeWindow({ start: at(18, 5), end: at(18, 47) }, 0)).toEqual({ from: at(17, 30), to: at(19, 0), ticks: [at(17, 30), at(18, 0), at(18, 30), at(19, 0)] });
    const long = rangeWindow({ start: at(8, 0), end: at(13, 0) }, 0);
    expect((long.ticks[1] ?? 0) - (long.ticks[0] ?? 0)).toBe(3600);
    expect(rangeWindow({ start: at(18, 5), end: at(18, 47) }, 20_700).from).toBe(at(17, 45));
  });

  it('moves one handle at a time, on whole minutes, inside the frame and never past the other handle', () => {
    const range = { start: at(18, 5), end: at(18, 47) };
    const bounds = { from: at(17, 30), to: at(19, 0) };
    expect(dragRange(range, 'start', at(18, 20) + 20, bounds)).toEqual({ start: at(18, 20), end: at(18, 47) });
    expect(dragRange(range, 'start', at(17, 0), bounds).start).toBe(at(17, 30));
    expect(dragRange(range, 'start', at(18, 59), bounds).start).toBe(at(18, 46));
    expect(dragRange(range, 'end', at(19, 40), bounds).end).toBe(at(19, 0));
    expect(dragRange(range, 'end', at(17, 0), bounds).end).toBe(at(18, 6));
  });

  it('reads the form times as a range, overnight too, and writes a range back', () => {
    const form: ActivityForm = { type: 'running', date: '2026-11-24', startTime: '23:30', endTime: '00:15', note: '' };
    expect(formRange(form, 0)).toEqual({ start: at(23, 30), end: at(24, 15) });
    expect(formRange({ ...form, endTime: '23:30' }, 0)).toBeNull();
    expect(formRange({ ...form, startTime: '9' }, 0)).toBeNull();
    expect(withRange(form, { start: at(6, 0), end: at(7, 5) }, 0)).toEqual({ ...form, date: '2026-11-24', startTime: '06:00', endTime: '07:05' });
  });
});

describe('edit activity screen', () => {
  it('drags the start handle and keeps the time fields in step', async () => {
    const saveActivity = jest.fn(async () => 7);
    const row = activity();
    await render(withAppData(<EditActivityScreen />, 'en', { activities: [row], saveActivity }));
    await layoutSlider();
    const handle = screen.getByTestId('edit-slider-start');
    await fireEvent(handle, 'responderGrant', touch(0, 2));
    await fireEvent(handle, 'responderMove', touch(60, 3));
    await fireEvent(handle, 'responderRelease', touch(60, 4));
    expect(screen.getByTestId('form-start').props.value).toBe('18:23');
    expect(screen.getByTestId('form-end').props.value).toBe('18:47');
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(saveActivity).toHaveBeenCalledWith(expect.objectContaining({ start: row.start + 18 * 60, end: row.end }), 7));
  });

  it('moves a handle by five minutes with the accessibility actions', async () => {
    await render(withAppData(<EditActivityScreen />, 'en', { activities: [activity()] }));
    await layoutSlider();
    const end = screen.getByTestId('edit-slider-end');
    expect(end.props.accessibilityValue).toEqual({ text: '18:47' });
    await fireEvent(end, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('form-end').props.value).toBe('18:52');
    await fireEvent(screen.getByTestId('edit-slider-start'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.getByTestId('form-start').props.value).toBe('18:00');
  });

  it('follows typed times and says when the times cannot be read', async () => {
    await render(withAppData(<EditActivityScreen />, 'en', { activities: [activity()] }));
    await layoutSlider();
    await fireEvent.changeText(screen.getByTestId('form-end'), '21:10');
    expect(screen.getByTestId('edit-slider-end').props.accessibilityValue).toEqual({ text: '21:10' });
    await fireEvent.changeText(screen.getByTestId('form-start'), '9');
    expect(screen.getByTestId('edit-slider-off')).toBeTruthy();
  });

  it('shows the activity type as a row that opens the type chips', async () => {
    await render(withAppData(<EditActivityScreen />, 'en', { activities: [activity()] }));
    expect(screen.getByTestId('edit-type-value')).toHaveTextContent('Running');
    expect(screen.queryByTestId('form-type-yoga')).toBeNull();
    await fireEvent.press(screen.getByTestId('edit-type-row'));
    await fireEvent.press(screen.getByTestId('form-type-yoga'));
    expect(screen.getByTestId('edit-type-value')).toHaveTextContent('Yoga');
    expect(screen.queryByTestId('form-type-yoga')).toBeNull();
  });

  it('says that delete works right away, with the real undo time', async () => {
    await render(withAppData(<EditActivityScreen />, 'en', { activities: [activity()] }));
    expect(screen.getByTestId('edit-delete-hint')).toHaveTextContent('Delete works right away, no need to save first. You can undo for 5 seconds.');
    expect(screen.getByTestId('form-note')).toBeTruthy();
    expect(screen.getByTestId('form-date')).toBeTruthy();
  });

  it('shows the hint in Dutch', async () => {
    await render(withAppData(<EditActivityScreen />, 'nl', { activities: [activity()] }));
    expect(screen.getByTestId('edit-delete-hint')).toHaveTextContent(/5 seconden ongedaan/);
  });
});
