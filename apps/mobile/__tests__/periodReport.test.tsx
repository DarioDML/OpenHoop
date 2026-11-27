import type { DayRecord } from '@openhoop/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { periodStats } from '@/data/activityDerived';
import { createFixtureDays } from '@/data/fixtureSource';
import {
  advisedMaxLoad,
  balancePoints,
  balanceShade,
  bedtimePoints,
  bedtimeSpread,
  bestDay,
  clockFromNoon,
  deltaOf,
  monthFocus,
  monthHeadline,
  weekVerdict,
} from '@/data/periodReport';
import { defaultUserData } from '@/data/userData';
import { defaultPlan } from '@/data/weeklyPlan';

import { FIXTURE_NOW, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));

jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

jest.mock('expo-file-system', () => {
  class MockDirectory {
    uri: string;
    constructor(...parts: Array<string | MockDirectory>) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists(): boolean {
      return false;
    }
    create(): void {}
    delete(): void {}
  }
  class MockFile {
    uri: string;
    constructor(folder: MockDirectory, name: string) {
      this.uri = `${folder.uri}/${name}`;
    }
    async write(): Promise<void> {
      await Promise.resolve();
    }
  }
  return { Directory: MockDirectory, File: MockFile, Paths: { cache: new MockDirectory('cache') } };
});

import MonthlyReportScreen from '@/app/plan/monthly-report';
import WeeklyReportScreen from '@/app/plan/weekly-report';

const days = createFixtureDays(FIXTURE_NOW);
const band = { mean: 10, low: 7, high: 13, count: 20 };

function day(dayKey: string, readiness: number | null, load: number | null): DayRecord {
  const base = days[0] as DayRecord;
  return {
    ...base,
    day: dayKey,
    readiness: { value: readiness, reason: null, coverage: 1, algo: 'x' },
    readinessCalibrating: false,
    load: { value: load, reason: null, coverage: 1, algo: 'x' },
  };
}

describe('load against readiness', () => {
  it('allows the lower, middle or full usual range by readiness', () => {
    expect(advisedMaxLoad(20, band)).toBeCloseTo(9);
    expect(advisedMaxLoad(50, band)).toBeCloseTo(11);
    expect(advisedMaxLoad(80, band)).toBeCloseTo(13);
  });

  it('flags days whose load went past what readiness allowed', () => {
    const points = balancePoints([day('2026-11-16', 20, 12), day('2026-11-17', 80, 12), day('2026-11-18', null, 5)], band);
    expect(points.map((p) => [p.day, p.over])).toEqual([
      ['2026-11-16', true],
      ['2026-11-17', false],
    ]);
    expect(balancePoints([day('2026-11-16', 20, 12)], null)[0]?.over).toBeNull();
    expect(balanceShade(band)[1]).toEqual({ x: 9, y: 0 });
  });

  it('turns the week into a verdict', () => {
    const cur = periodStats([]);
    const one = balancePoints([day('2026-11-15', 20, 15), day('2026-11-16', 80, 10)], band);
    expect(weekVerdict(one, cur, null, band)).toEqual({ kind: 'oneOver', day: '2026-11-15' });
    const two = balancePoints([day('2026-11-15', 20, 15), day('2026-11-16', 30, 15)], band);
    expect(weekVerdict(two, cur, null, band)).toEqual({ kind: 'manyOver', count: 2 });
    const calm = balancePoints([day('2026-11-16', 80, 8)], band);
    expect(weekVerdict(calm, { ...cur, readiness: 80, load: 8 }, null, band)).toEqual({ kind: 'room' });
    expect(weekVerdict(calm, { ...cur, readiness: 50, load: 12 }, null, band)).toEqual({ kind: 'balanced' });
    expect(weekVerdict([], { ...cur, load: 12 }, { ...cur, load: 8 }, null)).toEqual({ kind: 'moreLoad' });
    expect(weekVerdict([], { ...cur, load: 8 }, { ...cur, load: 8.2 }, null)).toEqual({ kind: 'steady' });
  });
});

describe('bedtimes', () => {
  it('reads bedtimes in local time around midnight', () => {
    const points = bedtimePoints(days.slice(-7));
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(p.minutesFromNoon).toBeGreaterThanOrEqual(0);
    expect(clockFromNoon(690)).toBe(1410);
    expect(clockFromNoon(780)).toBe(60);
    expect(bedtimeSpread([{ day: 'a', minutesFromNoon: 600 }, { day: 'b', minutesFromNoon: 690 }])).toBe(90);
    expect(bedtimeSpread([{ day: 'a', minutesFromNoon: 600 }])).toBeNull();
  });
});

describe('month helpers', () => {
  it('finds the best day and a focus', () => {
    const best = bestDay([day('2026-11-15', 60, 8), day('2026-11-16', 84, 10)]);
    expect(best?.day).toBe('2026-11-16');
    expect(best?.readiness).toBe(84);
    expect(bestDay([day('2026-11-15', null, 8)])).toBeNull();
    expect(monthFocus(days.slice(-30)).kind).toMatch(/weekendBedtime|consistency|sleepNeed|loadDays|keep/);
  });

  it('writes a headline from the change on the month before', () => {
    expect(['bestSleep', 'up', 'down', 'steady']).toContain(monthHeadline(days, 30).kind);
    expect(monthHeadline(days.slice(-5), 30)).toEqual({ kind: 'steady' });
  });

  it('gives a delta only when the periods compare', () => {
    expect(deltaOf(61, 59, true)).toEqual({ value: 2, trend: 'up' });
    expect(deltaOf(60, 60.5, true)).toEqual({ value: 1, trend: 'stable' });
    expect(deltaOf(61, 59, false)).toBeNull();
    expect(deltaOf(null, 59, true)).toBeNull();
  });
});

describe('weekly report screen', () => {
  beforeEach(() => {
    jest.mocked(isAvailableAsync).mockReset();
    jest.mocked(shareAsync).mockReset();
    jest.mocked(captureRef).mockReset();
  });

  it('shows a verdict, both charts and the stat grid', async () => {
    await render(withAppData(<WeeklyReportScreen />));
    expect(screen.getByTestId('report-verdict')).toBeTruthy();
    expect(screen.getByTestId('report-balance')).toBeTruthy();
    expect(screen.getByTestId('report-bedtimes')).toBeTruthy();
    for (const id of ['report-readiness', 'report-load', 'report-sleep', 'report-plan', 'report-loaddays', 'report-row-readiness']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(within(screen.getByTestId('report-plan')).getByText('No plan yet')).toBeTruthy();
  });

  it('counts plan goals hit this week', async () => {
    await render(withAppData(<WeeklyReportScreen />, 'en', { userData: { ...defaultUserData(), weeklyPlan: defaultPlan(null) } }));
    expect(screen.getByTestId('report-plan-value')).toHaveTextContent(/^\d\/3$/);
    expect(screen.getByText('goals hit')).toBeTruthy();
  });

  it('shares the report card as an image through the share sheet', async () => {
    jest.mocked(isAvailableAsync).mockResolvedValue(true);
    jest.mocked(captureRef).mockResolvedValue('aGk=');
    jest.mocked(shareAsync).mockResolvedValue();
    await render(withAppData(<WeeklyReportScreen />));
    await fireEvent.press(screen.getByTestId('report-share'));
    await fireEvent.press(screen.getByTestId('report-share-sheet-send'));
    await waitFor(() => expect(shareAsync).toHaveBeenCalledWith(expect.stringContaining('openhoop-week.png'), expect.objectContaining({ mimeType: 'image/png' })));
  });

  it('says so when sharing is not available', async () => {
    jest.mocked(isAvailableAsync).mockResolvedValue(false);
    await render(withAppData(<WeeklyReportScreen />));
    await fireEvent.press(screen.getByTestId('report-share'));
    await fireEvent.press(screen.getByTestId('report-share-sheet-send'));
    await waitFor(() => expect(screen.getByTestId('report-share-sheet-error')).toHaveTextContent('Sharing is not available on this device.'));
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('hides the verdict and share when there are too few days', async () => {
    await render(withAppData(<WeeklyReportScreen />, 'en', { days: days.slice(-2) }));
    expect(screen.getByTestId('report-few')).toBeTruthy();
    expect(screen.queryByTestId('report-verdict')).toBeNull();
    expect(screen.queryByTestId('report-share')).toBeNull();
  });
});

describe('monthly report story', () => {
  it('opens on the overview page with tiles, best day and focus', async () => {
    await render(withAppData(<MonthlyReportScreen />));
    expect(screen.getByTestId('report-page-label')).toHaveTextContent(/^Page 1 of 5 · /);
    expect(screen.getByTestId('report-headline')).toBeTruthy();
    for (const id of ['report-sleepscore', 'report-readiness', 'report-hrv', 'report-loaddays-tile', 'report-best-day', 'report-focus']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(within(screen.getByTestId('report-best-day')).getByText(/^Readiness \d+%$/)).toBeTruthy();
  });

  it('pages through readiness, sleep, load and the comparison, then closes', async () => {
    await render(withAppData(<MonthlyReportScreen />));
    await fireEvent.press(screen.getByTestId('report-next'));
    expect(screen.getByTestId('report-page-label')).toHaveTextContent(/^Page 2 of 5/);
    expect(screen.getByTestId('report-readiness-chart')).toBeTruthy();
    expect(screen.getByTestId('report-row-hrv')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('report-next'));
    expect(screen.getByTestId('report-sleep-chart')).toBeTruthy();
    expect(screen.getByTestId('report-sleep')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('report-next'));
    expect(screen.getByTestId('report-load-chart')).toBeTruthy();
    expect(screen.getByTestId('report-loaddays')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('report-next'));
    expect(screen.getByTestId('report-headline')).toHaveTextContent('Compared with the 30 days before.');
    for (const id of ['report-row-readiness', 'report-row-load', 'report-row-sleep', 'report-row-hrv', 'report-row-restingHr']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.queryByTestId('report-next')).toBeNull();
    await fireEvent.press(screen.getByTestId('report-done'));
    expect(router.back).toHaveBeenCalled();
  });

  it('jumps to a page from the progress dots', async () => {
    await render(withAppData(<MonthlyReportScreen />));
    await fireEvent.press(screen.getByTestId('report-page-4'));
    expect(screen.getByTestId('report-load-chart')).toBeTruthy();
  });

  it('stays honest with too few days', async () => {
    await render(withAppData(<MonthlyReportScreen />, 'en', { days: days.slice(-2) }));
    expect(screen.getByTestId('report-few')).toBeTruthy();
    expect(screen.queryByTestId('report-pages')).toBeNull();
  });
});
