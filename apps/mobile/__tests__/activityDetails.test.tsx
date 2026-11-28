import type { ActivityRow } from '@openhoop/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { chartBucketS } from '@/data/activities';
import { createFixtureDays } from '@/data/fixtureSource';
import type { RoutePoint } from '@/data/route';
import { zoneRangeLabels } from '@/ui/activity/ZoneRows';
import { elapsedTicks } from '@/ui/health/HeartRateChart';

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

import ActivityDetailsScreen from '@/app/activity/details';

const days = createFixtureDays(FIXTURE_NOW);
const LAT = 51.05;
const LON = 3.72;
const M_PER_DEG = 111_195;

function activity(over: Partial<ActivityRow> = {}): ActivityRow {
  const day = days[days.length - 1];
  const start = (day?.start ?? 0) + 3600;
  return {
    id: 7,
    deviceId: 1,
    source: 'live',
    detectedStart: null,
    type: 'running',
    start,
    end: start + 2530,
    paused: [],
    note: null,
    deletedAt: null,
    metrics: { activeS: 2530, load: 11.2, loadReason: null, zoneSeconds: [0, 180, 495, 965, 760, 130], avgHr: 148, maxHr: 176, hrSeconds: 2530, activeMinutes: null },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function routeLine(count: number, stepM: number): RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({ tMs: 1_000_000 + i * 20_000, lat: LAT + (i * stepM) / M_PER_DEG, lon: LON, altM: null, accuracyM: 5, segment: 0 }));
}

beforeEach(() => {
  mockParams = { id: '7' };
  jest.clearAllMocks();
});

describe('details helpers', () => {
  it('picks round elapsed ticks and keeps the end apart', () => {
    expect(elapsedTicks(2530)).toEqual([0, 600, 1200, 1800, 2530]);
    expect(elapsedTicks(1800)).toEqual([0, 600, 1200, 1800]);
    expect(elapsedTicks(300)).toEqual([0, 60, 120, 180, 240, 300]);
    expect(elapsedTicks(0)).toEqual([0]);
    expect(elapsedTicks(20 * 3600).length).toBeLessThanOrEqual(6);
  });

  it('asks for about 150 heart-rate points per session, never finer than 5 s', () => {
    expect(chartBucketS(2530)).toBe(17);
    expect(chartBucketS(300)).toBe(5);
  });

  it('labels zones by heart-rate reserve, or in bpm for custom zones', () => {
    expect(zoneRangeLabels(null, 190)).toEqual({ basis: 'hrr', labels: ['40–60%', '60–70%', '70–80%', '80–90%', '90–100%'] });
    expect(zoneRangeLabels([100, 120, 140, 160, 180], 195)).toEqual({ basis: 'custom', labels: ['100–119', '120–139', '140–159', '160–179', '180–195'] });
    expect(zoneRangeLabels([100, 120, 140, 160, 200], 190).labels[4]).toBe('≥200');
  });
});

describe('activity details', () => {
  it('leads with the Load ring and the duration, and lists the zones with their ranges', async () => {
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity()] }));
    expect(screen.getByTestId('detail-load')).toHaveTextContent(/11\.2/);
    expect(screen.getByTestId('detail-duration')).toHaveTextContent('42:10');
    expect(screen.getByTestId('detail-kind')).toHaveTextContent('Recorded live');
    expect(screen.getByTestId('detail-zones-5')).toHaveTextContent(/Z5 90–100%/);
    expect(screen.getByTestId('detail-zones-5')).toHaveTextContent(/02:10/);
    expect(screen.getByTestId('detail-zones')).toHaveTextContent(/% HR reserve/);
  });

  it('draws the stored heart rate over the session with an elapsed-time axis', async () => {
    const entry = activity();
    const points = Array.from({ length: 150 }, (_, i) => ({ t: entry.start + i * 17, hr: 120 + (i % 30) }));
    const heartRateBetween = jest.fn(async () => points);
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [entry], heartRateBetween }));
    expect(heartRateBetween).toHaveBeenCalledWith(entry.start, entry.end, 17);
    expect(await screen.findByTestId('detail-hr-chart')).toBeTruthy();
    await fireEvent(screen.getByTestId('detail-hr-chart').children[0] as never, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 160 } } });
    expect(screen.getByTestId('detail-hr-chart-axis')).toHaveTextContent(/00:00.*10:00.*20:00.*30:00.*42:10/);
  });

  it('says when no heart rate is stored for the session', async () => {
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity()] }));
    expect(await screen.findByText('No heart rate is stored for this time.')).toBeTruthy();
  });

  it('shows the distance tile only when the activity has a route, in the chosen units', async () => {
    const routeFor = jest.fn(async () => routeLine(301, 10));
    const settings = { language: 'en' as const, dataSource: 'demo' as const, ownerSince: null, units: 'imperial' as const };
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity()], routeFor, settings }));
    expect(await screen.findByTestId('detail-distance')).toHaveTextContent(/1\.86\s*mi/);
    expect(routeFor).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('route-distance')).toHaveTextContent(/1\.86\s*mi/);
    expect(screen.getByTestId('route-splits')).toHaveTextContent(/1 mi/);
  });

  it('has no distance tile without a route', async () => {
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity()] }));
    await screen.findByTestId('detail-no-route');
    expect(screen.queryByTestId('detail-distance')).toBeNull();
  });

  it('shows custom zone ranges in bpm', async () => {
    await render(
      withAppData(<ActivityDetailsScreen />, 'en', {
        activities: [activity()],
        profile: { birthYear: null, maxHeartRate: 195, zoneMode: 'custom', zoneFloors: [100, 120, 140, 160, 180] },
      }),
    );
    expect(screen.getByTestId('detail-zones-3')).toHaveTextContent(/Z3 140–159/);
    expect(screen.getByTestId('detail-zones')).toHaveTextContent(/bpm, your own zones/);
  });

  it('opens edit and share from the buttons at the bottom', async () => {
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity()] }));
    await fireEvent.press(screen.getByTestId('detail-share'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/activity/share', params: { id: '7' } });
    await fireEvent.press(screen.getByTestId('detail-edit'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/activity/edit', params: { id: '7' } });
  });

  it('keeps the detected chip and has no Load ring for a detected workout', async () => {
    const withWorkout = days.find((d) => d.workouts.some((w) => w.source === 'auto'));
    const index = withWorkout?.workouts.findIndex((w) => w.source === 'auto') ?? 0;
    mockParams = { day: withWorkout?.day ?? '', index: String(index) };
    await render(withAppData(<ActivityDetailsScreen />));
    expect(screen.getByTestId('detail-kind')).toHaveTextContent('Detected automatically');
    expect(screen.queryByTestId('detail-load')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('detail-zones')).toBeTruthy());
  });

  it('shows Dutch zone headings', async () => {
    await render(withAppData(<ActivityDetailsScreen />, 'nl', { activities: [activity()] }));
    expect(screen.getByTestId('detail-zones')).toHaveTextContent(/% hartslagreserve/);
  });
});
