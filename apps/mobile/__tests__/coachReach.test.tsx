import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { defaultCoachPrefs, withProactivity } from '@/coach/prefs';
import { createFixtureDays } from '@/data/fixtureSource';
import { refreshesNotifications } from '@/data/notificationState';
import type { NotificationPrefs } from '@/data/userData';
import { planAlerts, type Alert } from '@/lib/notificationPlan';
import { CoachPill } from '@/ui/daily/cards';

import { FIXTURE_NOW, fixtureAppData, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

const PREFS: NotificationPrefs = { enabled: true, morningDigest: false, syncProblems: false, goals: false, coachCheckins: true, quietStart: '22:00', quietEnd: '07:00' };

describe('coach notification', () => {
  it('replans notifications when the coach or network settings change', () => {
    expect(refreshesNotifications({ coach: defaultCoachPrefs() })).toBe(true);
    expect(refreshesNotifications({ network: { enabled: false, features: { coach: false, maps: false, labs: false, strava: false } } })).toBe(true);
    expect(refreshesNotifications({ notifications: PREFS })).toBe(true);
    expect(refreshesNotifications({ name: 'x' })).toBe(false);
  });

  it('drops a scheduled check-in notification once the coach is off', () => {
    const now = new Date(2026, 10, 25, 12);
    const scheduled: Alert = { kind: 'coachCheckin', id: 'coach:2026-11-25', at: new Date(2026, 10, 25, 19).getTime(), day: '2026-11-25' };
    const base = { now, prefs: PREFS, pending: [scheduled], sent: [], factsFor: () => null, lastSyncAt: null, watchBand: false };
    expect(planAlerts({ ...base, coachReady: true }).map((alert) => alert.id)).toEqual(['coach:2026-11-25']);
    expect(planAlerts({ ...base, coachReady: false })).toEqual([]);
  });
});

describe('home coach pill', () => {
  const days = createFixtureDays(FIXTURE_NOW);
  const latest = days[days.length - 1];
  const changed = latest === undefined ? days : [...days.slice(0, -1), { ...latest, hrv: { ...latest.hrv, value: 5 } }];
  const base = fixtureAppData().userData;

  it('shows the check-in mark only when the coach is on and check-ins are wanted', async () => {
    await render(withAppData(<CoachPill />, 'en', { days: changed, userData: { ...base, coach: withProactivity(defaultCoachPrefs(), 'patterns') } }));
    expect(screen.getByTestId('coach-pill-check-in')).toBeTruthy();
  });

  it('hides it while the coach is switched off', async () => {
    await render(withAppData(<CoachPill />, 'en', { days: changed, userData: { ...base, coach: { ...withProactivity(defaultCoachPrefs(), 'patterns'), enabled: false } } }));
    expect(screen.queryByTestId('coach-pill-check-in')).toBeNull();
  });

  it('hides it while proactivity is off', async () => {
    await render(withAppData(<CoachPill />, 'en', { days: changed, userData: { ...base, coach: withProactivity(defaultCoachPrefs(), 'off') } }));
    expect(screen.queryByTestId('coach-pill-check-in')).toBeNull();
  });
});
