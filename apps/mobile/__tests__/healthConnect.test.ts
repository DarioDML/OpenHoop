import type { DayRecord, Derived, ImportedBodyMeasurement, SleepPeriodRecord, WorkoutRecord } from '@openhoop/core';
import type { HealthConnectRecord, Permission } from 'react-native-health-connect';

import type { HealthConnectApi } from '@/data/healthConnectApi';
import { defaultHealthConnectState, parseHealthConnectState, serializeHealthConnectState, type HealthConnectState } from '@/data/healthConnectState';
import { EXPORT_WINDOW_DAYS, FIRST_IMPORT_DAYS, runHealthConnectSync, type HcSyncContext } from '@/data/healthConnectSync';
import {
  clientRecordId,
  exerciseSessionRecords,
  exportRecords,
  heartRateRecords,
  hrvRecords,
  planBodyImport,
  restingHeartRateRecords,
  skinTemperatureRecords,
  sleepSessionRecords,
  spo2Records,
  wantedPermissions,
} from '@/lib/healthConnectMapping';

const DAY_S = 86_400;
const NOW_S = Date.UTC(2026, 10, 25, 12) / 1000;
const NIGHT_ONSET = Date.UTC(2026, 10, 24, 22) / 1000;
const NIGHT_OFFSET = Date.UTC(2026, 10, 25, 6, 30) / 1000;
const WINDOW = { fromS: NOW_S - 30 * DAY_S, nowS: NOW_S, version: 7 };

function derived(value: number | null): Derived {
  return { value, reason: value === null ? 'no-sleep' : null, coverage: null, algo: 'test' };
}

function period(onset: number, offset: number, extra: Partial<SleepPeriodRecord> = {}): SleepPeriodRecord {
  return { onset, offset, asleepS: offset - onset, inBedS: offset - onset, nap: false, source: 'detected', editId: null, ...extra };
}

function makeDay(overrides: Partial<DayRecord> = {}, periods: SleepPeriodRecord[] = [period(NIGHT_ONSET, NIGHT_OFFSET)], workouts: WorkoutRecord[] = []): DayRecord {
  return {
    deviceId: 1,
    day: '2026-11-25',
    start: Date.UTC(2026, 10, 25) / 1000,
    end: Date.UTC(2026, 10, 26) / 1000,
    tzOffsetS: 0,
    flags: [],
    sleep: {
      periods,
      asleepS: null,
      inBedS: null,
      need: derived(null),
      debt: derived(null),
      consistency: derived(null),
      score: derived(null),
    },
    hrv: derived(52.4),
    restingHr: derived(54.6),
    respiratoryRate: derived(14.2),
    spo2: derived(96.5),
    skinTempC: derived(34.1),
    skinTempDeviationC: derived(-0.3),
    readiness: derived(null),
    readinessCalibrating: false,
    readinessContributions: null,
    load: derived(null),
    zoneSeconds: [],
    steps: null,
    heartRate: { min: null, avg: null, max: null },
    workouts,
    ...overrides,
  };
}

describe('Health Connect mapping', () => {
  it('maps the nightly values at wake time with stable client ids and the given version', () => {
    const [rhr] = restingHeartRateRecords([makeDay()], WINDOW);
    expect(rhr).toEqual({
      recordType: 'RestingHeartRate',
      time: '2026-11-25T06:30:00.000Z',
      beatsPerMinute: 55,
      metadata: { clientRecordId: `openhoop.rhr.${NIGHT_OFFSET}`, clientRecordVersion: 7, recordingMethod: 2, device: { type: 6 } },
    });
    expect(hrvRecords([makeDay()], WINDOW)[0]?.heartRateVariabilityMillis).toBe(52.4);
    expect(spo2Records([makeDay()], WINDOW)[0]?.percentage).toBe(96.5);
    expect(restingHeartRateRecords([makeDay()], { ...WINDOW, version: 8 })[0]?.metadata?.clientRecordId).toBe(rhr?.metadata?.clientRecordId);
  });

  it('writes nothing for values the band could not support, out of range values, or nights outside the window', () => {
    expect(restingHeartRateRecords([makeDay({ restingHr: derived(null) })], WINDOW)).toEqual([]);
    expect(hrvRecords([makeDay({ hrv: derived(450) })], WINDOW)).toEqual([]);
    expect(spo2Records([makeDay({}, [])], WINDOW)).toEqual([]);
    expect(spo2Records([makeDay({}, [period(NIGHT_ONSET, NIGHT_OFFSET, { nap: true })])], WINDOW)).toEqual([]);
    expect(restingHeartRateRecords([makeDay()], { ...WINDOW, nowS: NIGHT_OFFSET - 1 })).toEqual([]);
    expect(restingHeartRateRecords([makeDay()], { ...WINDOW, fromS: NIGHT_OFFSET + 1 })).toEqual([]);
  });

  it('maps skin temperature as a delta on the personal baseline over the night, in Celsius', () => {
    const [record] = skinTemperatureRecords([makeDay()], WINDOW);
    expect(record?.startTime).toBe('2026-11-24T22:00:00.000Z');
    expect(record?.endTime).toBe('2026-11-25T06:30:00.000Z');
    expect(record?.baseline?.value).toBeCloseTo(34.4);
    expect(record?.deltas).toEqual([{ time: '2026-11-24T22:00:00.000Z', delta: { value: -0.3, unit: 'celsius' } }]);
    expect(record?.measurementLocation).toBe(3);
    const noAbsolute = skinTemperatureRecords([makeDay({ skinTempC: derived(null) })], WINDOW)[0];
    expect(noAbsolute?.baseline).toBeUndefined();
    expect(skinTemperatureRecords([makeDay({ skinTempDeviationC: derived(null) })], WINDOW)).toEqual([]);
  });

  it('writes every sleep and nap once, marking hand-made ones as manual entries', () => {
    const nap = period(NOW_S - 4 * 3_600, NOW_S - 3 * 3_600, { nap: true, source: 'manual' });
    const night = period(NIGHT_ONSET, NIGHT_OFFSET);
    const records = sleepSessionRecords([makeDay({}, [night, nap]), makeDay({}, [night])], WINDOW);
    expect(records.map((r) => r.metadata?.clientRecordId)).toEqual([clientRecordId('sleep', NIGHT_ONSET), clientRecordId('sleep', nap.onset)]);
    expect(records.map((r) => r.metadata?.recordingMethod)).toEqual([2, 3]);
    expect(records[0]?.stages).toBeUndefined();
  });

  it('maps detected and logged workouts to exercise sessions with a known type or "other"', () => {
    const workouts: WorkoutRecord[] = [
      { start: NOW_S - 7_200, end: NOW_S - 3_600, zoneSeconds: [], avgHr: 120, maxHr: 150, source: 'auto', label: null },
      { start: NOW_S - 3_000, end: NOW_S - 1_000, zoneSeconds: [], avgHr: 130, maxHr: 160, source: 'manual', label: 'running' },
      { start: NOW_S - 900, end: NOW_S - 100, zoneSeconds: [], avgHr: 130, maxHr: 160, source: 'manual', label: 'padel' },
    ];
    const records = exerciseSessionRecords([makeDay({}, [], workouts)], WINDOW);
    expect(records.map((r) => [r.exerciseType, r.metadata?.recordingMethod])).toEqual([
      [0, 2],
      [56, 3],
      [0, 3],
    ]);
  });

  it('groups minute heart rate into hourly records with whole beats and stable ids', () => {
    const hour = Math.floor(NOW_S / 3_600) * 3_600 - 2 * 3_600;
    const minutes = [
      { t: hour + 60, hr: 61.4 },
      { t: hour, hr: 60.6 },
      { t: hour + 3_600, hr: 0 },
      { t: hour + 3_660, hr: 70 },
      { t: NOW_S + 60, hr: 80 },
    ];
    const records = heartRateRecords(minutes, WINDOW);
    expect(records).toHaveLength(2);
    expect(records[0]?.samples).toEqual([
      { time: new Date(hour * 1000).toISOString(), beatsPerMinute: 61 },
      { time: new Date((hour + 60) * 1000).toISOString(), beatsPerMinute: 61 },
    ]);
    expect(records[0]?.startTime).toBe(new Date(hour * 1000).toISOString());
    expect(records[0]?.endTime).toBe(new Date((hour + 61) * 1000).toISOString());
    expect(records[1]?.metadata?.clientRecordId).toBe(clientRecordId('hr', hour + 3_600));
  });

  it('asks only for the permissions of the enabled types', () => {
    const state = defaultHealthConnectState();
    expect(wantedPermissions(state)).toEqual([]);
    state.export.hrv = true;
    state.import.weight = true;
    expect(wantedPermissions(state)).toEqual([
      { accessType: 'write', recordType: 'HeartRateVariabilityRmssd' },
      { accessType: 'read', recordType: 'Weight' },
    ]);
  });
});

describe('Health Connect body import plan', () => {
  const tz = (): number => 3_600;
  const weight = (id: string, time: string, kg: number, origin = 'com.scale', extra: Record<string, unknown> = {}) => ({
    metadata: { id, dataOrigin: origin },
    time,
    weight: { inKilograms: kg, inGrams: kg * 1000 },
    ...extra,
  });
  const fat = (id: string, time: string, percentage: number, origin = 'com.scale') => ({ metadata: { id, dataOrigin: origin }, time, percentage });

  it('turns weights into log entries in local days, attaching the closest body fat from the same app and day', () => {
    const plan = planBodyImport(
      [weight('w1', '2026-11-20T23:30:00Z', 80.456), weight('w2', '2026-11-21T07:00:00Z', 80.1, 'com.other')],
      [fat('f1', '2026-11-20T23:31:00Z', 19.94), fat('f2', '2026-11-21T07:00:00Z', 30, 'com.scale'), fat('f3', '2026-11-20T23:45:00Z', 22)],
      'app.openhoop.mobile',
      tz,
    );
    expect(plan.entries).toEqual<ImportedBodyMeasurement[]>([
      { day: '2026-11-21', weightKg: 80.46, bodyFatPct: 19.9, externalId: 'w1', origin: 'com.scale' },
      { day: '2026-11-21', weightKg: 80.1, bodyFatPct: null, externalId: 'w2', origin: 'com.other' },
    ]);
    expect(plan.bodyFatUnmatched).toBe(0);
  });

  it('uses the zone offset stored with the record when there is one', () => {
    const plan = planBodyImport([weight('w1', '2026-11-20T23:30:00Z', 80, 'com.scale', { zoneOffset: { id: '-05:00', totalSeconds: -18_000 } })], [], 'x', tz);
    expect(plan.entries[0]?.day).toBe('2026-11-20');
  });

  it('drops malformed records, its own records, and body fat without a weight', () => {
    const plan = planBodyImport(
      [
        weight('w1', 'not a time', 80),
        { metadata: {}, time: '2026-11-20T08:00:00Z', weight: { inKilograms: 80 } },
        weight('w2', '2026-11-20T08:00:00Z', Number.NaN),
        weight('w3', '2026-11-20T08:00:00Z', 80, 'app.openhoop.mobile'),
        'garbage',
        null,
      ],
      [fat('f1', '2026-11-22T08:00:00Z', 20)],
      'app.openhoop.mobile',
      tz,
    );
    expect(plan.entries).toEqual([]);
    expect(plan.bodyFatUnmatched).toBe(1);
  });
});

describe('Health Connect state', () => {
  it('round-trips and starts with everything off', () => {
    const state = defaultHealthConnectState();
    expect(Object.values(state.export).some(Boolean)).toBe(false);
    expect(state.afterBandSync).toBe(false);
    state.export.sleep = true;
    state.lastSync = { at: NOW_S, results: { sleep: { status: 'ok', count: 3 }, weight: { status: 'error', step: 'read' } } };
    expect(parseHealthConnectState(serializeHealthConnectState(state))).toEqual(state);
  });

  it('drops anything it does not recognise', () => {
    const parsed = parseHealthConnectState(
      JSON.stringify({
        export: { sleep: 'yes', hrv: true, steps: true },
        heartRateCursorS: -5,
        lastSync: { at: NOW_S, results: { hrv: { status: 'ok', count: -1 }, sleep: { status: 'weird' }, weight: { status: 'error', step: 'nope' }, spo2: { status: 'denied' } } },
      }),
    );
    expect(parsed.export.hrv).toBe(true);
    expect(parsed.export.sleep).toBe(false);
    expect(parsed.heartRateCursorS).toBeNull();
    expect(parsed.lastSync?.results).toEqual({ spo2: { status: 'denied' } });
    expect(parseHealthConnectState('{not json')).toEqual(defaultHealthConnectState());
    expect(parseHealthConnectState('[1]')).toEqual(defaultHealthConnectState());
  });
});

interface FakeApi extends HealthConnectApi {
  inserted: HealthConnectRecord[][];
  deleted: string[];
  reads: { type: string; fromS: number }[];
}

function fakeApi(granted: Permission[], options: { failInsert?: string; failRead?: string; weights?: unknown[]; fats?: unknown[] } = {}): FakeApi {
  const api: FakeApi = {
    inserted: [],
    deleted: [],
    reads: [],
    availability: async () => 'available',
    grantedPermissions: async () => new Set(granted.map((p) => `${p.accessType}:${p.recordType}`)),
    requestPermissions: async () => new Set(),
    insert: async (records) => {
      if (records[0]?.recordType === options.failInsert) throw new Error('SecurityException');
      api.inserted.push(records);
      return records.length;
    },
    deleteOwn: async (type) => {
      api.deleted.push(type);
    },
    readAll: async (type, fromS) => {
      api.reads.push({ type, fromS });
      if (type === options.failRead) throw new Error('read failed');
      return type === 'Weight' ? (options.weights ?? []) : (options.fats ?? []);
    },
    openSettings: () => undefined,
    openStore: async () => undefined,
  };
  return api;
}

function context(api: HealthConnectApi, state: HealthConnectState, overrides: Partial<HcSyncContext> = {}): HcSyncContext {
  return {
    api,
    state,
    days: [makeDay()],
    exportAllowed: true,
    heartRate: async (fromS) => [{ t: fromS + 60, hr: 60 }],
    importBody: async (entries) => ({ saved: entries.length, skipped: 0 }),
    ownPackage: 'app.openhoop.mobile',
    nowS: NOW_S,
    version: 99,
    tzOffsetAt: () => 0,
    ...overrides,
  };
}

describe('Health Connect sync', () => {
  it('replaces its own records in the window, then writes, and reports per type', async () => {
    const state = defaultHealthConnectState();
    state.export.restingHeartRate = true;
    state.export.sleep = true;
    state.export.spo2 = true;
    const api = fakeApi([
      { accessType: 'write', recordType: 'RestingHeartRate' },
      { accessType: 'write', recordType: 'SleepSession' },
    ]);
    const outcome = await runHealthConnectSync(context(api, state));
    expect(api.deleted).toEqual(['RestingHeartRate', 'SleepSession']);
    expect(outcome.report.results).toEqual({
      restingHeartRate: { status: 'ok', count: 1 },
      sleep: { status: 'ok', count: 1 },
      spo2: { status: 'denied' },
    });
    expect(outcome.report.at).toBe(NOW_S);
  });

  it('never writes demo data', async () => {
    const state = defaultHealthConnectState();
    state.export.hrv = true;
    state.export.heartRate = true;
    const api = fakeApi([{ accessType: 'write', recordType: 'HeartRateVariabilityRmssd' }]);
    const outcome = await runHealthConnectSync(context(api, state, { exportAllowed: false }));
    expect(api.inserted).toEqual([]);
    expect(api.deleted).toEqual([]);
    expect(outcome.report.results).toEqual({ heartRate: { status: 'demo' }, hrv: { status: 'demo' } });
  });

  it('keeps going after one type fails', async () => {
    const state = defaultHealthConnectState();
    state.export.hrv = true;
    state.export.respiratoryRate = true;
    const api = fakeApi(
      [
        { accessType: 'write', recordType: 'HeartRateVariabilityRmssd' },
        { accessType: 'write', recordType: 'RespiratoryRate' },
      ],
      { failInsert: 'HeartRateVariabilityRmssd' },
    );
    const outcome = await runHealthConnectSync(context(api, state));
    expect(outcome.report.results).toEqual({ hrv: { status: 'error', step: 'write' }, respiratoryRate: { status: 'ok', count: 1 } });
  });

  it('exports heart rate a day at a time from the last written hour and moves the cursor', async () => {
    const state = defaultHealthConnectState();
    state.export.heartRate = true;
    const cursor = NOW_S - 2 * DAY_S - 1_800;
    state.heartRateCursorS = cursor;
    const asked: number[] = [];
    const api = fakeApi([{ accessType: 'write', recordType: 'HeartRate' }]);
    const outcome = await runHealthConnectSync(
      context(api, state, {
        heartRate: async (fromS) => {
          asked.push(fromS);
          return [{ t: fromS + 60, hr: 60 }];
        },
      }),
    );
    const firstHour = Math.floor(cursor / 3_600) * 3_600;
    expect(asked[0]).toBe(firstHour);
    expect(asked).toHaveLength(3);
    expect(outcome.report.results.heartRate).toEqual({ status: 'ok', count: 3 });
    expect(outcome.heartRateCursorS).toBe(firstHour + 2 * DAY_S);
  });

  it('starts heart rate at the export window on the first sync', async () => {
    const state = defaultHealthConnectState();
    state.export.heartRate = true;
    const asked: number[] = [];
    const api = fakeApi([{ accessType: 'write', recordType: 'HeartRate' }]);
    await runHealthConnectSync(context(api, state, { heartRate: async (fromS) => (asked.push(fromS), []) }));
    expect(asked[0]).toBe(Math.floor((NOW_S - EXPORT_WINDOW_DAYS * DAY_S) / 3_600) * 3_600);
  });

  it('imports weight with body fat, a year back the first time and with overlap after that', async () => {
    const state = defaultHealthConnectState();
    state.import.weight = true;
    state.import.bodyFat = true;
    const api = fakeApi(
      [
        { accessType: 'read', recordType: 'Weight' },
        { accessType: 'read', recordType: 'BodyFat' },
      ],
      {
        weights: [{ metadata: { id: 'w', dataOrigin: 'com.scale' }, time: '2026-11-24T07:00:00Z', weight: { inKilograms: 80 } }],
        fats: [{ metadata: { id: 'f', dataOrigin: 'com.scale' }, time: '2026-11-24T07:00:00Z', percentage: 20 }],
      },
    );
    const stored: ImportedBodyMeasurement[][] = [];
    const outcome = await runHealthConnectSync(
      context(api, state, {
        importBody: async (entries) => {
          stored.push(entries);
          return { saved: entries.length, skipped: 0 };
        },
      }),
    );
    expect(api.reads.map((r) => [r.type, r.fromS])).toEqual([
      ['Weight', NOW_S - FIRST_IMPORT_DAYS * DAY_S],
      ['BodyFat', NOW_S - FIRST_IMPORT_DAYS * DAY_S],
    ]);
    expect(stored[0]).toEqual([{ day: '2026-11-24', weightKg: 80, bodyFatPct: 20, externalId: 'w', origin: 'com.scale' }]);
    expect(outcome.report.results).toEqual({ weight: { status: 'ok', count: 1 }, bodyFat: { status: 'ok', count: 1 } });
    expect(outcome.lastImportS).toBe(NOW_S);

    const again = fakeApi([{ accessType: 'read', recordType: 'Weight' }]);
    await runHealthConnectSync(context(again, { ...state, lastImportS: NOW_S - DAY_S }));
    expect(again.reads[0]?.fromS).toBe(NOW_S - 31 * DAY_S);
  });

  it('reports revoked or failed imports without moving the import mark', async () => {
    const state = { ...defaultHealthConnectState(), lastImportS: NOW_S - DAY_S };
    state.import.weight = true;
    state.import.bodyFat = true;
    const denied = await runHealthConnectSync(context(fakeApi([]), state));
    expect(denied.report.results).toEqual({ weight: { status: 'denied' }, bodyFat: { status: 'denied' } });
    expect(denied.lastImportS).toBe(NOW_S - DAY_S);

    const readFails = await runHealthConnectSync(context(fakeApi([{ accessType: 'read', recordType: 'Weight' }], { failRead: 'Weight' }), state));
    expect(readFails.report.results).toEqual({ weight: { status: 'error', step: 'read' }, bodyFat: { status: 'denied' } });

    const storeFails = await runHealthConnectSync(
      context(fakeApi([{ accessType: 'read', recordType: 'Weight' }]), state, {
        importBody: async () => {
          throw new Error('disk');
        },
      }),
    );
    expect(storeFails.report.results.weight).toEqual({ status: 'error', step: 'store' });
    expect(storeFails.lastImportS).toBe(NOW_S - DAY_S);
  });

  it('exports every type through one entry point', () => {
    for (const type of ['restingHeartRate', 'hrv', 'sleep', 'spo2', 'respiratoryRate', 'skinTemperature'] as const) {
      expect(exportRecords(type, [makeDay()], [], WINDOW)).toHaveLength(1);
    }
    expect(exportRecords('exercise', [makeDay()], [], WINDOW)).toEqual([]);
    expect(exportRecords('heartRate', [], [{ t: NOW_S - 60, hr: 60 }], WINDOW)).toHaveLength(1);
  });
});
