import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { defaultUserData } from '@/data/userData';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { buzzView } from '@/ui/activity/LiveParts';

import { FIXTURE_NOW, fixtureBandActions, withAppData } from './support/appData';

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

import LiveActivityScreen from '@/app/activity/live';

const liveAt = (heartRate: number, updatedAt: number) => ({ active: true, heartRate, lastRrMs: 400, updatedAt });

beforeEach(() => {
  mockParams = {};
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('buzz chip', () => {
  it('derives its state from the saved setting only', () => {
    const on = { atTarget: true, overTop: false, lastTarget: null, lastTop: null };
    expect(buzzView({ ...on, atTarget: false }, { low: 7, high: 12 }, '2026-11-25')).toBe('off');
    expect(buzzView(on, null, '2026-11-25')).toBe('noTarget');
    expect(buzzView(on, { low: 7, high: 12 }, '2026-11-25')).toBe('armed');
    expect(buzzView({ ...on, lastTarget: '2026-11-25' }, { low: 7, high: 12 }, '2026-11-25')).toBe('done');
    expect(buzzView({ ...on, lastTarget: '2026-11-24' }, { low: 7, high: 12 }, '2026-11-25')).toBe('armed');
  });
});

describe('live HUD', () => {
  it('shows the heart-rate ring, the zone strip and the recording status', async () => {
    mockParams = { type: 'running' };
    await render(withAppData(<LiveActivityScreen />, 'en', { live: liveAt(150, 1), profile: { birthYear: null, maxHeartRate: 200 } }));
    expect(screen.getByTestId('live-status')).toHaveTextContent('Ready');
    expect(screen.getByTestId('live-hr-ring')).toBeTruthy();
    expect(screen.getByTestId('live-zones-active')).toBeTruthy();
    expect(screen.getByTestId('live-zones').props.accessibilityLabel).toBe('Heart-rate zone 2');
    expect(screen.queryByTestId('live-load')).toBeNull();
    await fireEvent.press(screen.getByTestId('live-begin'));
    expect(await screen.findByTestId('live-pause')).toBeTruthy();
    expect(screen.getByTestId('live-status')).toHaveTextContent(/Recording/);
    expect(screen.getByTestId('live-load')).toBeTruthy();
    expect(screen.getByTestId('live-calories')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('live-pause'));
    expect(screen.getByTestId('live-status')).toHaveTextContent('Paused');
  });

  it('estimates calories from the session heart rate once the profile is complete', async () => {
    let nowMs = FIXTURE_NOW.getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    mockParams = { type: 'running' };
    const base = {
      profile: { birthYear: 1990, maxHeartRate: 190 },
      userData: { ...defaultUserData(), onboardingDone: true, weightKg: 70, heightCm: 178, sex: 'male' as const },
    };
    const view = await render(withAppData(<LiveActivityScreen />, 'en', { ...base, live: liveAt(150, nowMs) }));
    await fireEvent.press(screen.getByTestId('live-begin'));
    for (let i = 1; i <= 64; i++) {
      nowMs += 1000;
      await act(async () => {
        await view.rerender(withAppData(<LiveActivityScreen />, 'en', { ...base, live: liveAt(150, nowMs) }));
      });
    }
    expect(screen.getByTestId('live-calories')).toHaveTextContent(/\d+\s*kcal/);
    expect(screen.getByTestId('live-avg')).toHaveTextContent(/150/);
  }, 30_000);

  it('says why calories are missing without a body profile', async () => {
    mockParams = { type: 'running', start: '1' };
    await render(withAppData(<LiveActivityScreen />, 'en', { live: liveAt(150, 1) }));
    expect(await screen.findByTestId('live-calories')).toHaveTextContent(/No data|Body profile/);
    expect(screen.getByTestId('live-max')).toHaveTextContent(/No heart rate yet|150/);
  });

  it('shows the saved buzz state as a plain chip', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
    mockParams = { type: 'running', start: '1' };
    const todayKey = unixToIsoDate(Math.floor(FIXTURE_NOW.getTime() / 1000), deviceTzOffsetS(FIXTURE_NOW));
    const on = { atTarget: true, overTop: false, lastTarget: null, lastTop: null };
    const view = await render(withAppData(<LiveActivityScreen />, 'en', { live: liveAt(120, 1), userData: { ...defaultUserData(), loadBuzz: on } }));
    expect(await screen.findByTestId('live-buzz')).toHaveTextContent(/^Buzz at \d/);
    await view.rerender(withAppData(<LiveActivityScreen />, 'en', { live: liveAt(120, 1), userData: { ...defaultUserData(), loadBuzz: { ...on, lastTarget: todayKey } } }));
    expect(screen.getByTestId('live-buzz')).toHaveTextContent(/today$/);
    await view.rerender(withAppData(<LiveActivityScreen />, 'en', { live: liveAt(120, 1), userData: defaultUserData() }));
    expect(screen.queryByTestId('live-buzz')).toBeNull();
  });

  it('never buzzes the band itself while recording', async () => {
    let nowMs = FIXTURE_NOW.getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    mockParams = { type: 'running', start: '1' };
    const buzz = jest.fn(async () => true);
    const bandActions = { ...fixtureBandActions(), buzz };
    const userData = { ...defaultUserData(), loadBuzz: { atTarget: true, overTop: true, lastTarget: null, lastTop: null } };
    const view = await render(withAppData(<LiveActivityScreen />, 'en', { bandActions, userData, live: liveAt(170, nowMs) }));
    for (let i = 1; i <= 5; i++) {
      nowMs += 1000;
      await act(async () => {
        await view.rerender(withAppData(<LiveActivityScreen />, 'en', { bandActions, userData, live: liveAt(170, nowMs) }));
      });
    }
    expect(buzz).not.toHaveBeenCalled();
  });

  it('shows Dutch status text', async () => {
    mockParams = { type: 'running', start: '1' };
    await render(withAppData(<LiveActivityScreen />, 'nl', { live: liveAt(120, 1) }));
    expect(await screen.findByText(/Neemt op/)).toBeTruthy();
  });
});
