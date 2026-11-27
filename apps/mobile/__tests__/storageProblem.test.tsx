import { render, screen } from '@testing-library/react-native';
import type * as ReactNative from 'react-native';

import { storageProblemOf } from '@/data/storageProblem';

import { fixtureAppData, withAppData } from './support/appData';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof ReactNative>('react-native');
  return { Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text> };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router/js-tabs', () => {
  const { Text } = jest.requireActual<typeof ReactNative>('react-native');
  const Tabs = Object.assign(() => <Text testID="tabs">tabs</Text>, { Screen: () => null });
  return { Tabs };
});

import TabsLayout from '@/app/(tabs)/_layout';

class DatabaseTooNewError extends Error {
  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super('newer');
    this.name = 'DatabaseTooNewError';
  }
}

describe('storageProblemOf', () => {
  it('recognises a database made by a newer app', () => {
    expect(storageProblemOf(new DatabaseTooNewError(15, 14))).toEqual({ kind: 'tooNew', found: 15, supported: 14 });
  });

  it('treats any other failure as unavailable', () => {
    expect(storageProblemOf(new Error('file is not a database'))).toEqual({ kind: 'unavailable' });
    expect(storageProblemOf('boom')).toEqual({ kind: 'unavailable' });
  });
});

describe('a database the app cannot open', () => {
  it('says the data was saved by a newer OpenHoop instead of starting setup', async () => {
    const base = fixtureAppData();
    await render(withAppData(<TabsLayout />, 'en', { storageProblem: { kind: 'tooNew', found: 15, supported: 14 }, userData: { ...base.userData, onboardingDone: false } }));
    expect(screen.getByTestId('storage-problem')).toBeTruthy();
    expect(screen.getByText('Saved by a newer OpenHoop')).toBeTruthy();
    expect(screen.getByText(/version 15/)).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
    expect(screen.queryByTestId('tabs')).toBeNull();
  });

  it('says it in Dutch', async () => {
    await render(withAppData(<TabsLayout />, 'nl', { storageProblem: { kind: 'tooNew', found: 15, supported: 14 } }));
    expect(screen.getByText('Opgeslagen door een nieuwere OpenHoop')).toBeTruthy();
  });

  it('keeps the plain storage message for other failures', async () => {
    await render(withAppData(<TabsLayout />, 'en', { storageProblem: { kind: 'unavailable' } }));
    expect(screen.getByText('The database cannot be opened. OpenHoop deletes nothing; restart the app.')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('still starts setup on a fresh install', async () => {
    const base = fixtureAppData();
    await render(withAppData(<TabsLayout />, 'en', { userData: { ...base.userData, onboardingDone: false } }));
    expect(screen.getByTestId('redirect')).toBeTruthy();
  });
});
