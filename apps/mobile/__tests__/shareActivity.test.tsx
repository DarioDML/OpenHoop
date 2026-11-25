import type { ActivityRow } from '@openhoop/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { createFixtureDays } from '@/data/fixtureSource';
import { defaultUserData } from '@/data/userData';

import { FIXTURE_NOW, withAppData } from './support/appData';

let mockParams: Record<string, string> = {};
const mockFiles = new Map<string, Uint8Array>();
const mockFolders = new Set<string>();

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
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
      return mockFolders.has(this.uri);
    }
    create(): void {
      mockFolders.add(this.uri);
    }
    delete(): void {
      mockFolders.delete(this.uri);
      for (const key of [...mockFiles.keys()]) if (key.startsWith(`${this.uri}/`)) mockFiles.delete(key);
    }
  }
  class MockFile {
    uri: string;
    constructor(folder: MockDirectory, name: string) {
      this.uri = `${folder.uri}/${name}`;
    }
    async write(bytes: Uint8Array): Promise<void> {
      await Promise.resolve();
      mockFiles.set(this.uri, bytes);
    }
  }
  return { Directory: MockDirectory, File: MockFile, Paths: { cache: new MockDirectory('cache') } };
});

import ShareActivityScreen from '@/app/activity/share';

const mockCapture = jest.mocked(captureRef);
const mockAvailable = jest.mocked(isAvailableAsync);
const mockShare = jest.mocked(shareAsync);

const PNG_BASE64 = Buffer.from([137, 80, 78, 71]).toString('base64');
const days = createFixtureDays(FIXTURE_NOW);

function lastDayStart(): number {
  const day = days[days.length - 1];
  if (day === undefined) throw new Error('fixture has no days');
  return day.start;
}

function activity(over: Partial<ActivityRow> = {}): ActivityRow {
  const start = lastDayStart();
  return {
    id: 7,
    deviceId: 1,
    source: 'manual',
    detectedStart: null,
    type: 'cycling',
    start: start + 3600,
    end: start + 5400,
    paused: [],
    note: 'secret note',
    deletedAt: null,
    metrics: { activeS: 1800, load: 6.2, loadReason: null, zoneSeconds: [0, 300, 600, 600, 300, 0], avgHr: 141, maxHr: 172, hrSeconds: 1800, activeMinutes: { totalMinutes: 30, measuredMinutes: 30, thresholdBpm: 112, activeHr: [{ bpm: 141, minutes: 30 }] } },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

const profiled = {
  profile: { birthYear: 1990, maxHeartRate: null },
  userData: { ...defaultUserData(), onboardingDone: true, weightKg: 70, heightCm: 178, sex: 'male' as const },
};

async function open(rows: ActivityRow[] = [activity()], extra: Record<string, unknown> = profiled): Promise<void> {
  mockParams = { id: '7' };
  await render(withAppData(<ShareActivityScreen />, 'en', { activities: rows, ...extra }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockFolders.clear();
  mockCapture.mockResolvedValue(PNG_BASE64);
  mockAvailable.mockResolvedValue(true);
  mockShare.mockResolvedValue(undefined);
});

describe('share activity screen', () => {
  it('draws the card with type, date, duration, Load, heart rate, zones and calories', async () => {
    await open();
    expect(screen.getByTestId('card-title')).toHaveTextContent('Cycling');
    expect(screen.getByTestId('card-date')).toBeTruthy();
    expect(screen.getByTestId('card-duration')).toHaveTextContent(/30 min/);
    expect(screen.getByTestId('card-load')).toHaveTextContent(/6\.2/);
    expect(screen.getByTestId('card-avg-hr')).toHaveTextContent(/141/);
    expect(screen.getByTestId('card-max-hr')).toHaveTextContent(/172/);
    expect(screen.getByTestId('card-zones')).toBeTruthy();
    expect(screen.getByTestId('card-calories')).toHaveTextContent(/\d+ kcal/);
    expect(screen.queryByTestId('card-name')).toBeNull();
    expect(screen.queryByText(/secret note/)).toBeNull();
  });

  it('hides the fields the user switches off', async () => {
    await open();
    for (const field of ['date', 'heartRate', 'load', 'zones', 'calories', 'duration']) {
      await fireEvent(screen.getByTestId(`share-toggle-${field}`), 'valueChange', false);
    }
    for (const id of ['card-date', 'card-avg-hr', 'card-max-hr', 'card-load', 'card-zones', 'card-calories', 'card-duration', 'card-no-hr']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId('card-title')).toBeTruthy();
  });

  it('leaves out Load, zones and calories when there is no data, and says there is no heart rate', async () => {
    const empty = activity({ metrics: { activeS: 1800, load: null, loadReason: 'no-data', zoneSeconds: [0, 0, 0, 0, 0, 0], avgHr: null, maxHr: null, hrSeconds: 0, activeMinutes: null } });
    await open([empty], {});
    expect(screen.getByTestId('card-no-hr')).toHaveTextContent('No heart rate');
    for (const id of ['card-load', 'card-zones', 'card-avg-hr', 'card-max-hr']) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByTestId('share-toggle-load')).toBeNull();
    expect(screen.queryByTestId('share-toggle-zones')).toBeNull();
  });

  it('offers no name toggle when the activity has no name', async () => {
    await open();
    expect(screen.queryByTestId('share-toggle-name')).toBeNull();
  });

  it('switches between the light and dark card', async () => {
    await open();
    const colorOf = (): unknown => {
      const style = screen.getByTestId('share-card').props.style as { backgroundColor?: string };
      return style.backgroundColor;
    };
    await fireEvent.press(screen.getByText('Light'));
    const light = colorOf();
    await fireEvent.press(screen.getByText('Dark'));
    expect(colorOf()).not.toEqual(light);
  });

  it('renders the card to a png, shares it and deletes the temporary file', async () => {
    let sharedUri = '';
    let existedWhileSharing = false;
    mockShare.mockImplementation(async (uri: string) => {
      sharedUri = uri;
      existedWhileSharing = mockFiles.has(uri);
    });
    await open();
    await fireEvent.press(screen.getByTestId('share-button'));
    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));
    expect(mockCapture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ format: 'png', result: 'base64' }));
    expect(mockShare).toHaveBeenCalledWith(expect.stringMatching(/openhoop-export-\d+\/openhoop-activity\.png$/), expect.objectContaining({ mimeType: 'image/png' }));
    expect(existedWhileSharing).toBe(true);
    await waitFor(() => expect(mockFiles.has(sharedUri)).toBe(false));
    expect(mockFolders.size).toBe(0);
    expect(screen.queryByTestId('share-error')).toBeNull();
  });

  it('deletes the temporary file when the share sheet fails', async () => {
    mockShare.mockRejectedValue(new Error('cancelled'));
    await open();
    await fireEvent.press(screen.getByTestId('share-button'));
    expect(await screen.findByTestId('share-error')).toHaveTextContent(/could not be made or shared/);
    expect(mockFiles.size).toBe(0);
    expect(mockFolders.size).toBe(0);
  });

  it('shows an error and renders nothing when sharing is unavailable', async () => {
    mockAvailable.mockResolvedValue(false);
    await open();
    await fireEvent.press(screen.getByTestId('share-button'));
    expect(await screen.findByTestId('share-error')).toHaveTextContent('Sharing is not available on this device.');
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockShare).not.toHaveBeenCalled();
    expect(mockFolders.size).toBe(0);
  });

  it('shows an error when the card cannot be captured', async () => {
    mockCapture.mockRejectedValue(new Error('capture failed'));
    await open();
    await fireEvent.press(screen.getByTestId('share-button'));
    expect(await screen.findByTestId('share-error')).toBeTruthy();
    expect(mockShare).not.toHaveBeenCalled();
    expect(mockFiles.size).toBe(0);
  });

  it('shows the not-found state for an unknown activity', async () => {
    await open([], {});
    expect(screen.queryByTestId('share-card')).toBeNull();
  });
});
