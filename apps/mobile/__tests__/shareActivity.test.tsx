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
const mockPick = jest.fn();

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
    createFile(name: string): MockFile {
      return new MockFile(this, name);
    }
    static async pickDirectoryAsync(initial?: string): Promise<MockDirectory> {
      return (await mockPick(initial)) as MockDirectory;
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
  return { Directory: MockDirectory, File: MockFile, Paths: { cache: new MockDirectory('cache') }, FileMode: {} };
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
    expect(screen.getByTestId('card-duration')).toHaveTextContent(/30:00/);
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
      await fireEvent.press(screen.getByTestId(`share-toggle-${field}`));
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

  it('saves the image to a folder the user picks, without the share sheet', async () => {
    const { Directory: PickedDirectory } = jest.requireMock<{ Directory: new (...parts: string[]) => object }>('expo-file-system');
    mockPick.mockResolvedValue(new PickedDirectory('content://downloads'));
    await open();
    await fireEvent.press(screen.getByTestId('share-save'));
    expect(await screen.findByTestId('share-saved')).toHaveTextContent(/saved in the folder you picked/);
    expect(mockPick).toHaveBeenCalledTimes(1);
    expect(mockShare).not.toHaveBeenCalled();
    expect(mockAvailable).not.toHaveBeenCalled();
    expect([...mockFiles.keys()]).toEqual([expect.stringMatching(/^content:\/\/downloads\/openhoop-cycling-\d{4}-\d{2}-\d{2}-story\.png$/)]);
  });

  it('does nothing when the folder picker is cancelled, and says when saving fails', async () => {
    mockPick.mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'ERR_PICKER_CANCELLED' }));
    await open();
    await fireEvent.press(screen.getByTestId('share-save'));
    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    expect(screen.queryByTestId('share-saved')).toBeNull();
    expect(screen.queryByTestId('share-error')).toBeNull();
    mockPick.mockRejectedValue(new Error('no picker'));
    await fireEvent.press(screen.getByTestId('share-save'));
    expect(await screen.findByTestId('share-error')).toHaveTextContent(/could not be saved there/);
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('switches between the story, square and transparent formats', async () => {
    await open();
    const sizeOf = (): { width?: number; minHeight?: number; backgroundColor?: string } => screen.getByTestId('share-card').props.style as { width?: number; minHeight?: number; backgroundColor?: string };
    expect(sizeOf()).toMatchObject({ width: 270, minHeight: 480 });
    await fireEvent.press(screen.getByText('Square'));
    expect(sizeOf()).toMatchObject({ width: 320, minHeight: 320 });
    await fireEvent.press(screen.getByText('Transparent'));
    expect(sizeOf().backgroundColor).toBe('transparent');
    expect(screen.getByTestId('share-transparent-note')).toBeTruthy();
  });

  it('draws the route with its ends hidden by default, with pace and an optional heart-rate chart', async () => {
    const LAT = 51.05;
    const route = Array.from({ length: 101 }, (_, i) => ({ tMs: i * 18_000, lat: LAT + (i * 30) / 111_195, lon: 3.72, altM: null, accuracyM: 5, segment: 0 }));
    const routeFor = jest.fn(async () => route);
    const start = activity().start;
    const heartRateBetween = jest.fn(async () => Array.from({ length: 20 }, (_, i) => ({ t: start + i * 90, hr: 120 + i })));
    await open([activity()], { ...profiled, routeFor, heartRateBetween });
    expect(await screen.findByTestId('card-route')).toBeTruthy();
    expect(screen.getByTestId('card-distance')).toHaveTextContent(/3\.00\s*km/);
    expect(screen.getByTestId('card-pace')).toHaveTextContent(/km\/h/);
    expect(screen.getByTestId('share-hide-ends').props.value).toBe(true);
    expect(screen.getByText('Leaves out 200 m around where you started and stopped')).toBeTruthy();
    expect(screen.queryByTestId('card-hr-chart')).toBeNull();
    await fireEvent.press(screen.getByTestId('share-toggle-hrChart'));
    expect(screen.getByTestId('card-hr-chart')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('share-toggle-route'));
    expect(screen.queryByTestId('card-route')).toBeNull();
    expect(screen.getByTestId('share-toggle-route').props.accessibilityState).toEqual({ checked: false });
  });

  it('offers no route chip or hide switch without a route', async () => {
    await open();
    expect(screen.queryByTestId('share-toggle-route')).toBeNull();
    expect(screen.queryByTestId('share-toggle-pace')).toBeNull();
    expect(screen.queryByTestId('share-hide-ends')).toBeNull();
  });

  it('shows the not-found state for an unknown activity', async () => {
    await open([], {});
    expect(screen.queryByTestId('share-card')).toBeNull();
  });
});
