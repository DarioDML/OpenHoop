import { Linking, Platform } from 'react-native';
import * as HealthConnect from 'react-native-health-connect';

import { nativeHealthConnect, statusToAvailability, toPermissionKeys } from '@/data/healthConnectApi';

jest.mock('react-native-health-connect', () => ({
  SdkAvailabilityStatus: { SDK_UNAVAILABLE: 1, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2, SDK_AVAILABLE: 3 },
  getSdkStatus: jest.fn(async () => 3),
  initialize: jest.fn(async () => true),
  getGrantedPermissions: jest.fn(async () => []),
  requestPermission: jest.fn(async () => []),
  insertRecords: jest.fn(async () => []),
  deleteRecordsByTimeRange: jest.fn(async () => undefined),
  readRecords: jest.fn(async () => ({ records: [] })),
  aggregateGroupByPeriod: jest.fn(async () => []),
  openHealthConnectSettings: jest.fn(),
}));

const mocked = jest.mocked(HealthConnect);

function androidVersion(version: number): void {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  androidVersion(34);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('native Health Connect wrapper', () => {
  it('reports Android only on other platforms and old Android versions without touching the module', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(await nativeHealthConnect.availability()).toBe('unsupported');
    jest.replaceProperty(Platform, 'OS', 'android');
    androidVersion(27);
    expect(await nativeHealthConnect.availability()).toBe('unsupported');
    expect(mocked.getSdkStatus).not.toHaveBeenCalled();
  });

  it('maps the SDK status and initialises only when it is available', async () => {
    expect(statusToAvailability(1)).toBe('not-installed');
    expect(statusToAvailability(2)).toBe('update-required');
    mocked.getSdkStatus.mockResolvedValueOnce(2);
    expect(await nativeHealthConnect.availability()).toBe('update-required');
    expect(mocked.initialize).not.toHaveBeenCalled();
    expect(await nativeHealthConnect.availability()).toBe('available');
    expect(mocked.initialize).toHaveBeenCalledTimes(1);
  });

  it('reads granted permissions defensively', async () => {
    expect(
      toPermissionKeys([{ accessType: 'write', recordType: 'SleepSession' }, { accessType: 'delete', recordType: 'X' }, null, 'read:Weight', { accessType: 'read' }]),
    ).toEqual(new Set(['write:SleepSession']));
    mocked.getGrantedPermissions.mockResolvedValueOnce([{ accessType: 'read', recordType: 'Weight' }]);
    const granted = await nativeHealthConnect.requestPermissions([{ accessType: 'read', recordType: 'Weight' }]);
    expect(mocked.requestPermission).toHaveBeenCalledWith([{ accessType: 'read', recordType: 'Weight' }]);
    expect(granted).toEqual(new Set(['read:Weight']));
  });

  it('writes in chunks of one record type and deletes only by time range', async () => {
    const records = Array.from({ length: 1_201 }, (_, i) => ({ recordType: 'OxygenSaturation' as const, time: new Date(i * 1000).toISOString(), percentage: 97 }));
    expect(await nativeHealthConnect.insert(records)).toBe(1_201);
    expect(mocked.insertRecords).toHaveBeenCalledTimes(3);
    await nativeHealthConnect.deleteOwn('SleepSession', 0, 60);
    expect(mocked.deleteRecordsByTimeRange).toHaveBeenCalledWith('SleepSession', {
      operator: 'between',
      startTime: '1970-01-01T00:00:00.000Z',
      endTime: '1970-01-01T00:01:00.000Z',
    });
  });

  it('follows read pages to the end', async () => {
    const weight = { time: '2026-11-20T08:00:00Z', weight: { inKilograms: 80 }, metadata: { id: 'a' } };
    mocked.readRecords
      .mockResolvedValueOnce({ records: [weight], pageToken: 'next' } as Awaited<ReturnType<typeof HealthConnect.readRecords>>)
      .mockResolvedValueOnce({ records: [weight] } as Awaited<ReturnType<typeof HealthConnect.readRecords>>);
    const records = await nativeHealthConnect.readAll('Weight', 0, 60);
    expect(records).toHaveLength(2);
    expect(mocked.readRecords).toHaveBeenLastCalledWith('Weight', expect.objectContaining({ pageToken: 'next' }));
  });

  it('reads steps as Health Connect daily totals and tolerates a non-list answer', async () => {
    const day = { startTime: '2026-11-24T00:00', endTime: '2026-11-25T00:00', result: { COUNT_TOTAL: 10, dataOrigins: [] } };
    mocked.aggregateGroupByPeriod.mockResolvedValueOnce([day] as Awaited<ReturnType<typeof HealthConnect.aggregateGroupByPeriod>>);
    expect(await nativeHealthConnect.stepsByDay(0, 60)).toEqual([day]);
    expect(mocked.aggregateGroupByPeriod).toHaveBeenCalledWith({
      recordType: 'Steps',
      timeRangeFilter: { operator: 'between', startTime: '1970-01-01T00:00:00.000Z', endTime: '1970-01-01T00:01:00.000Z' },
      timeRangeSlicer: { period: 'DAYS', length: 1 },
    });
    mocked.aggregateGroupByPeriod.mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof HealthConnect.aggregateGroupByPeriod>>);
    expect(await nativeHealthConnect.stepsByDay(0, 60)).toEqual([]);
  });

  it('opens the Play Store page for Health Connect, falling back to the web page', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('no store')).mockResolvedValueOnce(undefined);
    await nativeHealthConnect.openStore();
    expect(open.mock.calls[0]?.[0]).toMatch(/^market:\/\/details\?id=com\.google\.android\.apps\.healthdata/);
    expect(open.mock.calls[1]?.[0]).toBe('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata');
  });
});
