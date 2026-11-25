import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Profile } from '@openhoop/analytics';
import { bindStore, dayKey, deleteDataBefore, newestFrameTime, openStore, rebuildFromRaw, recomputeDays } from '../src/index';
import type { DayRecord, DeviceRow, SampleRow, Store, SyncStateRow } from '../src/index';
import { openStrictDriver } from './strictDriver';
import { TZ_S, awakeSamples, decodeRow, localMidnight, nightSamples, simulateDays, toFrame } from './sampleFactory';

const HOUR_S = 3_600;
const PROFILE: Profile = { maxHr: 190, birthYear: null, restingHr: null };
const DEVICE: Omit<DeviceRow, 'id'> = {
  bleId: 'AA:BB:CC',
  name: 'WHOOP 5',
  model: '5.0',
  firmware: '50.43.2.0',
  serial: 'SN1',
  ownerSince: null,
  configSnapshot: null,
};

function syncState(deviceId: number): SyncStateRow {
  return {
    deviceId,
    lastEndToken: null,
    lastSyncAt: 1,
    newestSampleT: null,
    readPage: null,
    writePage: null,
    trimPage: null,
    totalPages: null,
  };
}

function range(rows: SampleRow[]): { from: number; to: number } {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first === undefined || last === undefined) throw new Error('no rows');
  return { from: first.t, to: last.t + 1 };
}

describe('pipeline', () => {
  let store: Store;
  let deviceId: number;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (await store.upsertDevice(DEVICE)).id;
  });
  afterEach(async () => {
    await store.driver.close();
  });

  async function recompute(rows: SampleRow[], profile: Profile = PROFILE): Promise<DayRecord[]> {
    return recomputeDays(store, { deviceId, ...range(rows), profile, tzOffsetS: TZ_S });
  }

  async function storedDays(): Promise<DayRecord[]> {
    return store.listDays(deviceId, '0000-01-01', '9999-12-31');
  }

  describe('dayKey', () => {
    it('keys by the local calendar date', () => {
      expect(dayKey(0, 0)).toBe('1970-01-01');
      expect(dayKey(-1, 0)).toBe('1969-12-31');
      expect(dayKey(Date.UTC(2024, 1, 29, 23, 30) / 1000, 0)).toBe('2024-02-29');
      expect(dayKey(Date.UTC(2024, 1, 29, 23, 30) / 1000, TZ_S)).toBe('2024-03-01');
      expect(dayKey(Date.UTC(2026, 11, 31, 22, 59, 59) / 1000, TZ_S)).toBe('2026-12-31');
      expect(dayKey(Date.UTC(2026, 11, 31, 23, 0, 0) / 1000, TZ_S)).toBe('2027-01-01');
      expect(dayKey(Date.UTC(2026, 0, 1, 3, 0, 0) / 1000, -5 * HOUR_S)).toBe('2025-12-31');
    });
  });

  describe('recomputeDays', () => {
    describe('seven simulated days', () => {
      let weekStore: Store;
      let weekDevice: number;
      let rows: SampleRow[];
      let records: DayRecord[];
      const weekOpts = () => ({ deviceId: weekDevice, ...range(rows), profile: PROFILE, tzOffsetS: TZ_S });

      beforeAll(async () => {
        weekStore = await openStore(openStrictDriver());
        weekDevice = (await weekStore.upsertDevice(DEVICE)).id;
        rows = simulateDays(weekDevice, { days: 7, workoutDays: [2, 5] });
        await weekStore.insertSamples(rows);
        records = await recomputeDays(weekStore, weekOpts());
      });
      afterAll(async () => {
        await weekStore.driver.close();
      });

      it('yields seven records with calibrating on the first three', async () => {
        expect(records.map((r) => r.day)).toEqual([0, 1, 2, 3, 4, 5, 6].map((d) => dayKey(localMidnight(d), TZ_S)));
        for (const r of records) {
          expect(r.sleep.score).toMatchObject({ reason: null });
          expect(r.sleep.score.value).toBeGreaterThan(0);
          expect(r.hrv).toMatchObject({ reason: null });
          expect(r.hrv.value).toBeGreaterThan(20);
          expect(r.readiness).toMatchObject({ reason: null });
          expect(r.readiness.value).toBeGreaterThan(0);
          expect(r.readiness.value).toBeLessThanOrEqual(100);
          expect(r.readinessContributions).not.toBeNull();
          expect(r.load).toMatchObject({ reason: null });
          expect(r.load.value).toBeGreaterThanOrEqual(0);
          expect(r.restingHr.value).toBeCloseTo(52, 0);
          expect(r.respiratoryRate.value).toBeCloseTo(15, 0);
          expect(r.spo2.value).toBeGreaterThanOrEqual(96);
          expect(r.skinTempC.reason).toBeNull();
          expect(r.flags).toEqual([]);
          expect(r.tzOffsetS).toBe(TZ_S);
          expect(r.sleep.periods).toHaveLength(1);
          expect(r.sleep.periods[0]?.nap).toBe(false);
          expect(r.sleep.asleepS).toBe(8 * HOUR_S);
          expect(r.steps).toBe(28_800);
          expect(r.zoneSeconds).toHaveLength(6);
        }
        expect(records.map((r) => r.readinessCalibrating)).toEqual([true, true, true, false, false, false, false]);
        expect(records[0]?.sleep.need.value).toBe(27_834);
        expect(records[0]?.sleep.consistency.reason).toBe('needs-history');
        expect(records[6]?.sleep.consistency.reason).toBeNull();
        expect(records[0]?.skinTempDeviationC.reason).toBe('needs-history');
        expect(records[4]?.skinTempDeviationC.reason).toBeNull();
        expect(await weekStore.listDays(weekDevice, '0000-01-01', '9999-12-31')).toEqual(records);
      });

      it('keeps the load on a workout day and detects the workout', () => {
        const day = records[2];
        expect(day?.workouts).toHaveLength(1);
        const workout = day?.workouts[0];
        expect(workout).toMatchObject({ source: 'auto', label: null, maxHr: 151 });
        expect(workout?.avgHr).toBeCloseTo(150, 0);
        expect((workout?.end ?? 0) - (workout?.start ?? 0) + 1).toBe(2_400);
        expect(day?.load.value).toBeGreaterThan(5);
        expect(day?.heartRate).toMatchObject({ min: 51, max: 151 });
        expect(day?.zoneSeconds.reduce((a, b) => a + b, 0)).toBe(24 * HOUR_S);
        expect(records[0]?.workouts).toEqual([]);
        expect(records[3]?.sleep.need.value).toBeGreaterThan(records[2]?.sleep.need.value ?? Infinity);
      });

      it('recomputing the same range twice yields identical records', async () => {
        const stored = await weekStore.listDays(weekDevice, '0000-01-01', '9999-12-31');
        const again = await recomputeDays(weekStore, weekOpts());
        expect(again).toEqual(records);
        expect(JSON.stringify(again)).toBe(JSON.stringify(records));
        expect(await weekStore.listDays(weekDevice, '0000-01-01', '9999-12-31')).toEqual(stored);
      });

      it('recomputing from the middle matches the full run, using stored days as history', async () => {
        const tail = await recomputeDays(weekStore, { ...weekOpts(), from: localMidnight(4) + 12 * HOUR_S });
        expect(tail).toEqual(records.slice(4));
        expect(await weekStore.listDays(weekDevice, '0000-01-01', '9999-12-31')).toEqual(records);
      });
    });

    it.each([
      [0.05, 'low-coverage'],
      [0, 'missing-signal'],
    ])('a night with %f of its R-R intervals gives a reason for HRV and readiness, load stays ok', async (keep, reason) => {
      const rows = simulateDays(deviceId, { days: 5, rrKeepByDay: { 3: keep } });
      await store.insertSamples(rows);
      const records = await recompute(rows);
      const loose = records[3];
      expect(loose?.hrv).toMatchObject({ value: null, reason });
      expect(loose?.readiness).toMatchObject({ value: null, reason });
      expect(loose?.readinessContributions).toBeNull();
      expect(loose?.load).toMatchObject({ reason: null });
      expect(loose?.sleep.score).toMatchObject({ reason: null });
      expect(loose?.restingHr).toMatchObject({ reason: null });
      expect(records[4]?.hrv.reason).toBeNull();
      expect(records[4]?.readiness.reason).toBeNull();
    });

    it('a day with no sleep has no-sleep reasons for the sleep values and still an ok load', async () => {
      const rows = simulateDays(deviceId, { days: 4, noNightDays: [2] });
      await store.insertSamples(rows);
      const records = await recompute(rows);
      expect(records.map((r) => r.day)).toEqual([0, 1, 2, 3].map((d) => dayKey(localMidnight(d), TZ_S)));
      const quiet = records[2];
      expect(quiet?.sleep.periods).toEqual([]);
      expect(quiet?.sleep.asleepS).toBeNull();
      for (const derived of [
        quiet?.sleep.need,
        quiet?.sleep.debt,
        quiet?.sleep.consistency,
        quiet?.sleep.score,
        quiet?.hrv,
        quiet?.restingHr,
        quiet?.respiratoryRate,
        quiet?.spo2,
        quiet?.skinTempC,
        quiet?.readiness,
      ]) {
        expect(derived).toMatchObject({ value: null, reason: 'no-sleep', coverage: null });
        expect(derived?.algo).toMatch(/@\d+$/);
      }
      expect(quiet?.load).toMatchObject({ reason: null });
      expect(quiet?.load.value).not.toBeNull();
      expect(quiet?.start).toBe(localMidnight(2));
      expect(records[1]?.end).toBe(localMidnight(2));
      expect(quiet?.flags).toEqual([]);
      expect(records[3]?.sleep.score.reason).toBeNull();
    });

    it('a nap reduces the next night need by its asleep time', async () => {
      const plain = simulateDays(deviceId, { days: 3 });
      await store.insertSamples(plain);
      const withoutNap = await recompute(plain);
      await store.clearDerived(deviceId);
      await store.deleteSamples(deviceId);

      const napped = simulateDays(deviceId, { days: 3, napDays: [1] });
      await store.insertSamples(napped);
      const withNap = await recompute(napped);

      const nap = withNap[1]?.sleep.periods.find((p) => p.nap);
      expect(nap).toBeDefined();
      expect(withNap[1]?.sleep.periods).toHaveLength(2);
      expect(withNap[1]?.sleep.asleepS).toBe(withoutNap[1]?.sleep.asleepS);
      expect(withNap[1]?.sleep.need.value).toBe(withoutNap[1]?.sleep.need.value);
      const drop = (withoutNap[2]?.sleep.need.value ?? 0) - (withNap[2]?.sleep.need.value ?? 0);
      expect(nap?.asleepS ?? 0).toBeGreaterThan(2_000);
      expect(drop).toBeCloseTo(nap?.asleepS ?? -1, 6);
    });

    it('a night crossing midnight belongs to the wake-up date', async () => {
      const night = nightSamples(deviceId, localMidnight(3) - 2 * HOUR_S, 8 * HOUR_S, { seed: 3 });
      const rows = [...night, ...awakeSamples(deviceId, localMidnight(3) + 6 * HOUR_S, 16 * HOUR_S)];
      await store.insertSamples(rows);
      const records = await recompute(rows);
      expect(records).toHaveLength(1);
      const record = records[0];
      const period = record?.sleep.periods[0];
      expect(record?.day).toBe(dayKey(localMidnight(3), TZ_S));
      expect(dayKey(period?.onset ?? 0, TZ_S)).toBe(dayKey(localMidnight(2), TZ_S));
      expect(dayKey(period?.offset ?? 0, TZ_S)).toBe(record?.day);
      expect(record?.start).toBe(period?.onset);
    });

    it.each([
      ['a counter wrapping from 65530 to 4', (i: number) => (i < 100 ? 65_530 : 4), 10],
      ['a counter reset from 500 to 0', (i: number) => (i < 100 ? 500 : i < 200 ? 0 : 20), 20],
    ])('counts steps for %s', async (_name, counter, expected) => {
      const rows = awakeSamples(deviceId, localMidnight(0), 24 * HOUR_S).map((s, i) => ({ ...s, steps: counter(i) }));
      await store.insertSamples(rows);
      const records = await recompute(rows);
      expect(records).toHaveLength(1);
      expect(records[0]?.steps).toBe(expected);
    });

    it('flags the days touched by a chunk whose clock offset exceeds 120 seconds', async () => {
      const rows = simulateDays(deviceId, { days: 4 });
      const skewedFrom = localMidnight(2) - 2 * HOUR_S;
      const skewedTo = localMidnight(2);
      const nearFrom = localMidnight(3) + 2 * HOUR_S;
      const nearTo = nearFrom + HOUR_S;
      const inside = (r: SampleRow, a: number, b: number): boolean => r.t >= a && r.t < b;
      const commit = (a: number, b: number, clockOffsetS: number | null): Promise<number> =>
        store.commitChunk(
          { deviceId, endToken: null, frames: [], clockOffsetS, receivedAt: 1 },
          rows.filter((r) => inside(r, a, b)),
          { events: [], console: [], unknownFrames: 0, syncState: syncState(deviceId) },
        );
      await commit(skewedFrom, skewedTo, 3 * HOUR_S);
      await commit(nearFrom, nearTo, 100);
      await store.insertSamples(rows.filter((r) => !inside(r, skewedFrom, skewedTo) && !inside(r, nearFrom, nearTo)));

      const records = await recompute(rows);
      expect(records.map((r) => r.flags)).toEqual([[], ['clock-offset'], ['clock-offset'], []]);
    });

    it('treats a negative offset beyond 120 seconds as a clock offset too', async () => {
      const rows = simulateDays(deviceId, { days: 2 });
      await store.commitChunk(
        { deviceId, endToken: null, frames: [], clockOffsetS: -3_600, receivedAt: 1 },
        rows,
        { events: [], console: [], unknownFrames: 0, syncState: syncState(deviceId) },
      );
      const records = await recompute(rows);
      expect(records.map((r) => r.flags)).toEqual([['clock-offset'], ['clock-offset']]);
    });

    it('flags partial-day for a day with six hours of data', async () => {
      const rows = awakeSamples(deviceId, localMidnight(0) + 8 * HOUR_S, 6 * HOUR_S);
      await store.insertSamples(rows);
      const records = await recompute(rows);
      expect(records).toHaveLength(1);
      expect(records[0]?.flags).toEqual(['partial-day']);
      expect(records[0]?.load).toMatchObject({ value: null, reason: 'low-coverage' });
      expect(records[0]?.sleep.score.reason).toBe('no-sleep');
    });

    it('prefers history over hrm for the same second and uses hrm where history is missing', async () => {
      const rows = simulateDays(deviceId, { days: 1 });
      const holeFrom = localMidnight(0) + 12 * HOUR_S;
      const holeTo = holeFrom + 60;
      const history = rows.filter((r) => r.t < holeFrom || r.t >= holeTo);
      const hrm: SampleRow[] = [
        ...rows.filter((r) => r.t >= holeFrom - 100 && r.t < holeFrom).map((r) => ({ ...r, source: 'hrm' as const, hr: 200 })),
        ...rows.filter((r) => r.t >= holeFrom && r.t < holeTo).map((r) => ({ ...r, source: 'hrm' as const, hr: 120 })),
      ];
      await store.insertSamples([...history, ...hrm]);
      const records = await recomputeDays(store, { deviceId, ...range(rows), profile: PROFILE, tzOffsetS: TZ_S });
      expect(records[0]?.heartRate.max).toBe(120);
    });

    it('on an empty store a range late in the data starts early enough for the carried values', async () => {
      const rows = simulateDays(deviceId, { days: 5 });
      await store.insertSamples(rows);
      const late = await recomputeDays(store, {
        deviceId,
        from: localMidnight(4) + 12 * HOUR_S,
        to: range(rows).to,
        profile: PROFILE,
        tzOffsetS: TZ_S,
      });
      expect(late).toHaveLength(5);
      const stored = await storedDays();
      expect(stored).toHaveLength(5);
      expect(stored[4]?.readinessCalibrating).toBe(false);
      expect(stored[0]?.readinessCalibrating).toBe(true);
    });

    it('returns nothing without samples or for an empty range', async () => {
      expect(await recomputeDays(store, { deviceId, from: 0, to: 1_000_000, profile: PROFILE, tzOffsetS: TZ_S })).toEqual([]);
      await store.insertSamples(simulateDays(deviceId, { days: 1 }));
      expect(await recomputeDays(store, { deviceId, from: 100, to: 100, profile: PROFILE, tzOffsetS: TZ_S })).toEqual([]);
    });

    it('keeps manual workouts of a recomputed day', async () => {
      const rows = simulateDays(deviceId, { days: 2 });
      await store.insertSamples(rows);
      const first = await recompute(rows);
      const day = first[1];
      if (day === undefined) throw new Error('missing day');
      const manual = { start: day.start + 40_000, end: day.start + 42_000, zoneSeconds: [0, 0, 0, 0, 0, 0], avgHr: 120, maxHr: 130, source: 'manual' as const, label: 'run' };
      await store.replaceDay({ ...day, workouts: [manual] });
      const again = await recompute(rows);
      expect(again[1]?.workouts).toEqual([manual]);
    });
  });

  describe('sleep edits', () => {
    const DAY_S = 24 * HOUR_S;

    async function recomputeAfterEdit(onset: number): Promise<DayRecord[]> {
      await recomputeDays(store, { deviceId, from: onset - DAY_S, to: Number.MAX_SAFE_INTEGER, profile: PROFILE, tzOffsetS: TZ_S });
      return storedDays();
    }

    function nightOf(day: DayRecord | undefined): DayRecord['sleep']['periods'][number] {
      const period = day?.sleep.periods.find((p) => !p.nap);
      if (period === undefined) throw new Error('missing night');
      return period;
    }

    it('a shortened night recomputes debt, score and readiness from that day on, and reverting restores the detected days', async () => {
      const rows = simulateDays(deviceId, { days: 6 });
      await store.insertSamples(rows);
      const original = await recompute(rows);
      const night = nightOf(original[3]);
      const onset = night.onset;
      const offset = night.offset + 1 - 2 * HOUR_S;
      const id = await store.saveSleepEdit({ id: null, deviceId, targetOnset: night.onset, targetOffset: night.offset, onset, offset, createdAt: 1 });

      const edited = await recomputeAfterEdit(onset);
      const day = edited[3];
      expect(day?.sleep.periods).toEqual([{ onset, offset, asleepS: 6 * HOUR_S, inBedS: 6 * HOUR_S, nap: false, source: 'edited', editId: id }]);
      expect(day?.sleep.asleepS).toBe(6 * HOUR_S);
      expect(day?.sleep.need.value).toBe(original[3]?.sleep.need.value);
      expect(day?.sleep.debt.value).toBeGreaterThan(original[3]?.sleep.debt.value ?? Infinity);
      expect(day?.sleep.score.value).toBeLessThan(original[3]?.sleep.score.value ?? -Infinity);
      expect(day?.readiness.reason).toBeNull();
      expect(day?.readiness.value).not.toBe(original[3]?.readiness.value);
      expect(day?.hrv.reason).toBeNull();
      expect(edited[4]?.sleep.need.value).toBeGreaterThan(original[4]?.sleep.need.value ?? Infinity);
      expect(edited.slice(0, 3)).toEqual(original.slice(0, 3));
      expect(await recompute(rows)).toEqual(edited);

      expect(await store.deleteSleepEdit(deviceId, id)).toBe(true);
      expect(await recomputeAfterEdit(onset)).toEqual(original);
    });

    it('an earlier onset moves the day boundary and counts the added time as asleep', async () => {
      const rows = simulateDays(deviceId, { days: 4 });
      await store.insertSamples(rows);
      const original = await recompute(rows);
      const night = nightOf(original[2]);
      const onset = night.onset - HOUR_S;
      await store.saveSleepEdit({ id: null, deviceId, targetOnset: night.onset, targetOffset: night.offset, onset, offset: night.offset + 1, createdAt: 1 });

      const edited = await recomputeAfterEdit(onset);
      expect(edited[2]?.start).toBe(onset);
      expect(edited[1]?.end).toBe(onset);
      expect(edited[2]?.sleep.asleepS).toBe(9 * HOUR_S);
      expect(edited[2]?.restingHr.value).toBeCloseTo(original[2]?.restingHr.value ?? 0, 6);
      expect(edited[1]?.sleep.periods.every((p) => p.source === 'detected')).toBe(true);
    });

    it('a nap added by hand right after waking stays a nap and lowers the next night need', async () => {
      const rows = simulateDays(deviceId, { days: 3 });
      await store.insertSamples(rows);
      const original = await recompute(rows);
      const night = nightOf(original[1]);
      const onset = night.offset + 1 + 30 * 60;
      const id = await store.saveSleepEdit({ id: null, deviceId, targetOnset: null, targetOffset: null, onset, offset: onset + 2_700, createdAt: 1 });

      const edited = await recomputeAfterEdit(onset);
      expect(edited[1]?.sleep.periods).toEqual([
        { ...night },
        { onset, offset: onset + 2_700, asleepS: 2_700, inBedS: 2_700, nap: true, source: 'manual', editId: id },
      ]);
      expect(edited[1]?.sleep.asleepS).toBe(original[1]?.sleep.asleepS);
      const drop = (original[2]?.sleep.need.value ?? 0) - (edited[2]?.sleep.need.value ?? 0);
      expect(drop).toBeCloseTo(2_700, 6);
    });

    it('keeps a nap added after the newest reading', async () => {
      const rows = simulateDays(deviceId, { days: 2 });
      await store.insertSamples(rows);
      await recompute(rows);
      const newest = rows[rows.length - 1]?.t ?? 0;
      const onset = newest + 600;
      await store.saveSleepEdit({ id: null, deviceId, targetOnset: null, targetOffset: null, onset, offset: onset + 1_800, createdAt: 1 });

      const edited = await recomputeAfterEdit(onset);
      const last = edited[edited.length - 1];
      expect(last?.sleep.periods.find((p) => p.source === 'manual')).toMatchObject({ onset, asleepS: 1_800, nap: true });
      expect(last?.end).toBe(onset + 1_800);
    });
  });

  describe('rebuildFromRaw', () => {
    it('reproduces identical records from the raw frame archive', async () => {
      const rows = simulateDays(deviceId, { days: 2, workoutDays: [1] });
      const chunkSeconds = 4 * HOUR_S;
      const corrupted = 5_000;
      let archived = 0;
      for (let from = 0; from < rows.length; from += chunkSeconds) {
        const part = rows.slice(from, from + chunkSeconds);
        const frames = part.map((row, i) => toFrame(row, from + i));
        const stored: SampleRow[] = [];
        frames.forEach((frame, i) => {
          if (from + i === corrupted) {
            const bad = frame.slice();
            bad[14] = (bad[14] ?? 0) ^ 0xff;
            frames[i] = bad;
            return;
          }
          const row = decodeRow(deviceId, frame);
          if (row !== null) stored.push(row);
        });
        await store.commitChunk(
          { deviceId, endToken: null, frames, clockOffsetS: 0, receivedAt: 1 },
          stored,
          { events: [], console: [], unknownFrames: 0, syncState: syncState(deviceId) },
        );
        archived += stored.length;
      }
      const hrm: SampleRow = { ...(rows[100] as SampleRow), source: 'hrm', hr: 99, rr: [] };
      await store.insertSamples([hrm]);

      const opts = { deviceId, ...range(rows), profile: PROFILE, tzOffsetS: TZ_S };
      const before = await recomputeDays(store, opts);
      expect(before).toHaveLength(2);
      const countBefore = await store.sampleRange(deviceId);

      await store.deleteSamples(deviceId, 'history');
      await store.clearDerived(deviceId);
      expect(await store.sampleRange(deviceId)).toMatchObject({ count: 1 });
      expect(await storedDays()).toEqual([]);

      const rebuilt = await rebuildFromRaw(store, deviceId);
      expect(rebuilt).toEqual({ chunks: 12, samples: archived });
      expect(archived).toBe(rows.length - 1);
      expect(await store.sampleRange(deviceId)).toEqual(countBefore);

      const after = await recomputeDays(store, opts);
      expect(after).toEqual(before);
      expect(await storedDays()).toEqual(before);
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
      const kept = await store.samplesBetween(deviceId, hrm.t, hrm.t + 1);
      expect(kept.map((s) => s.source)).toEqual(['history', 'hrm']);
    });

    it('is idempotent and drops stale derived days', async () => {
      const rows = simulateDays(deviceId, { days: 1 });
      const frames = rows.slice(0, 600).map((row, i) => toFrame(row, i));
      await store.commitChunk(
        { deviceId, endToken: null, frames, clockOffsetS: null, receivedAt: 1 },
        [],
        { events: [], console: [], unknownFrames: 0, syncState: syncState(deviceId) },
      );
      await store.insertSamples(rows);
      await recompute(rows);
      expect(await storedDays()).toHaveLength(1);

      expect(await rebuildFromRaw(store, deviceId)).toEqual({ chunks: 1, samples: 600 });
      expect(await storedDays()).toEqual([]);
      expect(await rebuildFromRaw(store, deviceId)).toEqual({ chunks: 1, samples: 600 });
      expect(await store.sampleRange(deviceId)).toMatchObject({ count: 600 });
    });

    it('never writes records from before the device owner_since', async () => {
      const rows = simulateDays(deviceId, { days: 1 }).slice(0, 10);
      const frames = rows.map((row, i) => toFrame(row, i));
      await store.commitChunk(
        { deviceId, endToken: null, frames, clockOffsetS: null, receivedAt: 1 },
        [],
        { events: [], console: [], unknownFrames: 0, syncState: syncState(deviceId) },
      );
      await store.upsertDevice({ ...DEVICE, ownerSince: (rows[4] as SampleRow).t });
      expect(await rebuildFromRaw(store, deviceId)).toEqual({ chunks: 1, samples: 6 });
    });
  });

  describe('deleteDataBefore', () => {
    it('removes older samples and wholly older raw chunks, keeps a straddling chunk, and rebuild stays clean', async () => {
      const rows = simulateDays(deviceId, { days: 1 }).slice(0, 30);
      const chunks = [rows.slice(0, 10), rows.slice(10, 20), rows.slice(20, 30)];
      const ids: number[] = [];
      let index = 0;
      for (const part of chunks) {
        const frames = part.map((row) => toFrame(row, index++));
        ids.push(
          await store.commitChunk(
            { deviceId, endToken: null, frames, clockOffsetS: 0, receivedAt: 1 },
            part,
            { events: [], console: [], unknownFrames: 0, syncState: syncState(deviceId) },
          ),
        );
      }
      expect(newestFrameTime(chunks[0]?.map((row, i) => toFrame(row, i)) ?? [])).toBe((rows[9] as SampleRow).t);
      const cut = (rows[15] as SampleRow).t;
      await recompute(rows);

      const result = await store.driver.transaction(async (tx) => {
        const inner = bindStore(tx);
        await inner.upsertDevice({ ...DEVICE, ownerSince: cut });
        return deleteDataBefore(inner, deviceId, cut);
      });

      expect(result).toEqual({ samples: 15, events: 0, console: 0, chunks: 1 });
      expect(await store.listChunkIds(deviceId)).toEqual([ids[1], ids[2]]);
      expect(await store.sampleRange(deviceId)).toEqual({ first: cut, last: (rows[29] as SampleRow).t, count: 15 });
      expect(await storedDays()).toEqual([]);
      expect(await rebuildFromRaw(store, deviceId)).toEqual({ chunks: 2, samples: 15 });
    });
  });
});
