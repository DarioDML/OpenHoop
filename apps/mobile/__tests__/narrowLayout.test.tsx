import { render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { Chip } from '@/ui/Chip';
import { ListRow } from '@/ui/ListGroup';

import { withAppData } from './support/appData';

const mockWindow = { width: 412, height: 915, scale: 3, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));

import AccuracyScreen from '@/app/settings/accuracy';
import ConnectProviderScreen from '@/app/settings/connect-provider';
import VitalsScreen from '@/app/health/vitals';

function s24(): void {
  Object.assign(mockWindow, { width: 360, height: 780, fontScale: 1.3 });
}

function row() {
  return <ListRow testID="row" title="Lab test booking" subtitle="Order blood tests" chip={<Chip label="No provider yet" small testID="row-chip" />} chevron={false} />;
}

afterEach(() => {
  Object.assign(mockWindow, { width: 412, height: 915, fontScale: 1 });
});

describe('ListRow chip', () => {
  it('keeps the chip beside the label on a roomy screen', async () => {
    await render(row());
    expect(screen.getByTestId('row-chip')).toBeTruthy();
    expect(within(screen.getByTestId('row-text')).queryByTestId('row-chip')).toBeNull();
  });

  it('moves the chip under the label on a 360dp phone at 1.3 text size', async () => {
    s24();
    await render(row());
    expect(within(screen.getByTestId('row-text')).getByTestId('row-chip')).toBeTruthy();
  });
});

describe('screens at S24 size', () => {
  it('puts the provider status under each provider name', async () => {
    s24();
    await render(withAppData(<ConnectProviderScreen />));
    expect(within(screen.getByTestId('provider-labs-text')).getByText('No provider yet')).toBeTruthy();
  });

  it('puts the accuracy status under the metric name', async () => {
    s24();
    await render(withAppData(<AccuracyScreen />));
    expect(within(screen.getByTestId('accuracy-result-readiness-text')).getByTestId('accuracy-result-readiness-status')).toBeTruthy();
  });

  it('keeps the status beside the metric name on a roomy screen', async () => {
    await render(withAppData(<AccuracyScreen />));
    expect(within(screen.getByTestId('accuracy-result-readiness-text')).queryByTestId('accuracy-result-readiness-status')).toBeNull();
  });

  it('uses short vitals tile labels', async () => {
    s24();
    await render(withAppData(<VitalsScreen />));
    expect(within(screen.getByTestId('vital-rhr')).getByText('Resting HR')).toBeTruthy();
    expect(within(screen.getByTestId('vital-resp')).getByText('Breathing')).toBeTruthy();
  });
});
