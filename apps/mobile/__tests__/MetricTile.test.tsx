import { render, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { AppDataContext } from '@/data/context';
import { createFixtureDays, createFixtureDevice, createFixtureSettings } from '@/data/fixtureSource';
import type { AppData, Language } from '@/data/types';
import { MetricTile } from '@/ui/MetricTile';

function appData(language: Language): AppData {
  const now = new Date('2026-11-25T12:00:00Z');
  const noop = async (): Promise<void> => undefined;
  return {
    ready: true,
    syncProgress: null,
    notice: null,
    clearNotice: () => undefined,
    days: createFixtureDays(now),
    device: createFixtureDevice(now),
    live: { active: false, heartRate: null, lastRrMs: null, updatedAt: null },
    profile: { birthYear: null, maxHeartRate: null },
    settings: createFixtureSettings(language, now),
    scan: async () => [],
    pair: noop,
    sync: noop,
    startLive: noop,
    stopLive: noop,
    exportData: noop,
    updateProfile: noop,
    updateSettings: noop,
  };
}

function wrap(language: Language, children: ReactNode): ReactElement {
  return <AppDataContext.Provider value={appData(language)}>{children}</AppDataContext.Provider>;
}

describe('MetricTile', () => {
  it('shows the translated reason and no number for a null value', async () => {
    await render(wrap('nl', <MetricTile testID="t" label="HRV" value={null} reason="low-coverage" unit="ms" level="B" />));
    expect(screen.getByText('Te weinig meetdata')).toBeTruthy();
    expect(screen.queryByTestId('t-value')).toBeNull();
    expect(screen.queryByText(/\d/)).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('ms')).toBeNull();
  });

  it('shows the English reason when the language is English', async () => {
    await render(wrap('en', <MetricTile label="HRV" value={null} reason="no-sleep" level="B" />));
    expect(screen.getByText('No sleep recorded')).toBeTruthy();
  });

  it('never renders a bare dash or zero for a missing reason', async () => {
    await render(wrap('en', <MetricTile label="Steps" value={null} level="A" />));
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('renders the value, unit and parity level when present', async () => {
    await render(wrap('nl', <MetricTile testID="t" label="HRV" value={52.4} decimals={1} unit="ms" level="B" />));
    expect(screen.getByText('52,4')).toBeTruthy();
    expect(screen.getByText('ms')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('treats a real zero as a value', async () => {
    await render(wrap('en', <MetricTile testID="t" label="Steps" value={0} level="A" />));
    expect(screen.getByTestId('t-value')).toBeTruthy();
  });
});

describe('fixture data', () => {
  const days = createFixtureDays(new Date('2026-11-25T12:00:00Z'));

  it('has about 40 ascending days', () => {
    expect(days).toHaveLength(40);
    const labels = days.map((d) => d.day);
    expect([...labels].sort()).toEqual(labels);
  });

  it('covers the required special cases', () => {
    expect(days.slice(0, 3).every((d) => d.readinessCalibrating)).toBe(true);
    expect(days.slice(3).some((d) => d.readinessCalibrating)).toBe(false);
    const lowCoverage = days.filter((d) => d.hrv.value === null && d.hrv.reason === 'low-coverage' && d.readiness.value === null);
    expect(lowCoverage.length).toBeGreaterThanOrEqual(2);
    expect(days.some((d) => d.sleep.score.reason === 'no-sleep')).toBe(true);
    expect(days.some((d) => d.flags.includes('clock-offset'))).toBe(true);
    expect(days.some((d) => d.workouts.length > 0)).toBe(true);
  });

  it('is deterministic', () => {
    const again = createFixtureDays(new Date('2026-11-25T12:00:00Z'));
    expect(again).toEqual(days);
  });
});
