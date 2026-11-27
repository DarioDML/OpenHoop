import { act, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useAppData } from '@/data/context';
import { changesAppData } from '@/data/liveData';
import type { AppData, LiveData } from '@/data/types';

import { FIXTURE_NOW, fixtureAppData, fixtureLiveData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/data/notifier', () => ({ expoNotifier: { onReceived: () => () => undefined } }));
jest.mock('@/data/controller', () => ({ AppController: jest.fn().mockImplementation(() => mockController) }));

class FakeController {
  private readonly listeners = new Set<() => void>();
  private snapshot: AppData & LiveData = { ...fixtureAppData('en'), ...fixtureLiveData() };
  private cache: AppData | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LiveData => this.snapshot;

  getAppData = (): AppData => {
    if (this.cache === null) {
      const { live: _live, syncProgress: _syncProgress, pendingDelete: _pendingDelete, ...rest } = this.snapshot;
      this.cache = rest;
    }
    return this.cache;
  };

  start = async (): Promise<void> => undefined;
  refreshNotifications = async (): Promise<void> => undefined;
  refreshWidgets = async (): Promise<void> => undefined;

  patch(change: Partial<AppData & LiveData>): void {
    this.snapshot = { ...this.snapshot, ...change };
    if (changesAppData(change)) this.cache = null;
    for (const listener of [...this.listeners]) listener();
  }
}

let mockController = new FakeController();

import HomeScreen from '@/app/(tabs)/index';
import { LiveProvider } from '@/data/LiveProvider';
import { ExplainProvider } from '@/ui/explain/ExplainProvider';

let appDataRenders = 0;
function AppDataConsumer() {
  useAppData();
  appDataRenders += 1;
  return null;
}

describe('changesAppData', () => {
  it('ignores changes that only touch live data', () => {
    expect(changesAppData({ live: { active: true, heartRate: 60, lastRrMs: null, updatedAt: 1 } })).toBe(false);
    expect(changesAppData({ syncProgress: null, pendingDelete: null })).toBe(false);
  });

  it('flags any other field', () => {
    expect(changesAppData({ days: [] })).toBe(true);
    expect(changesAppData({ notice: null, syncProgress: null })).toBe(true);
  });
});

describe('LiveProvider', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
    mockController = new FakeController();
    appDataRenders = 0;
  });

  it('updates the live cards without re-rendering app data consumers', async () => {
    await render(
      <LiveProvider>
        <ExplainProvider>
          <AppDataConsumer />
          <HomeScreen />
        </ExplainProvider>
      </LiveProvider>,
    );
    const rendersAfterMount = appDataRenders;

    for (let beat = 0; beat < 5; beat++) {
      await act(async () => mockController.patch({ live: { active: true, heartRate: 70 + beat, lastRrMs: 850, updatedAt: beat + 1 } }));
    }
    expect(screen.getByTestId('card-live')).toHaveTextContent(/74/);

    await act(async () => mockController.patch({ syncProgress: { phase: 'transfer', chunks: 3, percent: 40, daysDone: 0, daysTotal: 0 } }));
    expect(screen.getByTestId('sync-banner')).toBeTruthy();
    expect(appDataRenders).toBe(rendersAfterMount);

    await act(async () => mockController.patch({ notice: { key: 'error.storage' } }));
    expect(appDataRenders).toBe(rendersAfterMount + 1);
  });
});
