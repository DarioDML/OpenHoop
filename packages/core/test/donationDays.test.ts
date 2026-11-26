import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Profile } from '@openhoop/analytics';
import { encodeConsole, encodeEvent } from '@openhoop/protocol';
import {
  collectBandDayFrames,
  emptyRemovalCounts,
  frameHex,
  listDonationDays,
  openStore,
  recomputeDays,
} from '../src/index';
import type { DayRecord, DeviceRow, DonationBandDay, EventRow, SampleRow, Store, SyncStateRow } from '../src/index';
import { openStrictDriver } from './strictDriver';
import { TZ_S, decodeRow, simulateDays, toFrame } from './sampleFactory';

const HOUR_S = 3_600;
const PROFILE: Profile = { maxHr: 190, birthYear: null, restingHr: null };

function device(bleId: string): Omit<DeviceRow, 'id'> {
  return { bleId, name: 'WHOOP 5', model: '5.0', firmware: '50.43.2.0', serial: 'SN1', ownerSince: null, configSnapshot: null };
}

function syncState(deviceId: number): SyncStateRow {
  return { deviceId, lastEndToken: null, lastSyncAt: 1, newestSampleT: null, readPage: null, writePage: null, trimPage: null, totalPages: null };
}

async function commit(store: Store, deviceId: number, frames: Uint8Array[], samples: SampleRow[], events: EventRow[] = []): Promise<number> {
  return store.commitChunk({ deviceId, endToken: null, frames, clockOffsetS: 0, receivedAt: 1 }, samples, {
    events,
    console: [],
    unknownFrames: 0,
    syncState: syncState(deviceId),
  });
}

interface Seeded {
  deviceId: number;
  rows: SampleRow[];
  records: DayRecord[];
  chunkIds: number[];
}

async function seed(store: Store, bleId: string): Promise<Seeded> {
  const deviceId = (await store.upsertDevice(device(bleId))).id;
  const rows = simulateDays(deviceId, { days: 2 });
  const chunkIds: number[] = [];
  for (let from = 0; from < rows.length; from += 4 * HOUR_S) {
    const frames = rows.slice(from, from + 4 * HOUR_S).map((row, i) => toFrame(row, from + i));
    const samples = frames.map((frame) => decodeRow(deviceId, frame)).filter((row): row is SampleRow => row !== null);
    chunkIds.push(await commit(store, deviceId, frames, samples));
  }
  const first = rows[0] as SampleRow;
  const last = rows[rows.length - 1] as SampleRow;
  await recomputeDays(store, { deviceId, from: first.t, to: last.t + 1, profile: PROFILE, tzOffsetS: TZ_S });
  return { deviceId, rows, records: await store.listDays(deviceId, '0000-01-01', '9999-12-31'), chunkIds };
}

function bandOf(seeded: Seeded, record: DayRecord): DonationBandDay {
  return { deviceId: seeded.deviceId, model: '5.0', day: record.day, start: record.start, end: record.end, tzOffsetS: record.tzOffsetS, frameEstimate: 1 };
}

describe('donation days', () => {
  let store: Store;
  let a: Seeded;
  let lastRecord: DayRecord;
  let nowS: number;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    a = await seed(store, 'AA:01');
    lastRecord = a.records[a.records.length - 1] as DayRecord;
    nowS = lastRecord.end - 1;
  });
  afterEach(async () => {
    await store.driver.close();
  });

  it('lists finished days with band data, newest first', async () => {
    expect(a.records.length).toBeGreaterThanOrEqual(2);
    const finished = a.records.slice(0, -1);
    const days = await listDonationDays(store, nowS);
    expect(days.map((d) => d.day)).toEqual(finished.map((r) => r.day).reverse());
    const newest = finished[finished.length - 1] as DayRecord;
    expect(days[0]?.bands).toEqual([
      expect.objectContaining({ deviceId: a.deviceId, model: '5.0', day: newest.day, start: newest.start, end: newest.end }),
    ]);
    expect(days[0]?.bands[0]?.frameEstimate).toBe(a.rows.filter((r) => r.t >= newest.start && r.t < newest.end).length);
    expect(days[0]?.asleepS).toBe(newest.sleep.asleepS);
  });

  it('marks official values by time overlap, not by the day text', async () => {
    const [first, second] = a.records;
    if (first === undefined || second === undefined) throw new Error('needs two days');
    await store.driver.run(
      "INSERT INTO vendor_sleeps (onset, wake, tz_offset_s, day, nap, imported_at) VALUES (?, ?, 3600, '1999-01-01', 0, 1)",
      [second.start + 60, second.start + HOUR_S],
    );
    const days = await listDonationDays(store, lastRecord.end);
    expect(days.find((d) => d.day === second.day)?.official).toBe(true);
    expect(days.find((d) => d.day === first.day)?.official).toBe(false);
  });

  it('counts an open official cycle as overlapping for 24 hours after its start', async () => {
    const [first] = a.records;
    if (first === undefined) throw new Error('needs a day');
    await store.driver.run(
      "INSERT INTO vendor_cycles (start_t, end_t, tz_offset_s, day, imported_at) VALUES (?, NULL, 3600, '1999-01-01', 1)",
      [first.start - 23 * HOUR_S],
    );
    const days = await listDonationDays(store, lastRecord.end);
    expect(days.find((d) => d.day === first.day)?.official).toBe(true);
  });

  it('leaves out days from before the owner took the band', async () => {
    const [first] = a.records;
    if (first === undefined) throw new Error('needs a day');
    await store.driver.run('UPDATE devices SET owner_since = ? WHERE id = ?', [first.end, a.deviceId]);
    const days = await listDonationDays(store, lastRecord.end);
    expect(days.map((d) => d.day)).not.toContain(first.day);
  });

  it('merges two bands on the same day into one row', async () => {
    const b = await seed(store, 'BB:02');
    const days = await listDonationDays(store, lastRecord.end);
    expect(days[0]?.bands.map((band) => band.deviceId)).toEqual([a.deviceId, b.deviceId]);
  });
});

describe('the frames of one day', () => {
  let store: Store;
  let a: Seeded;
  let record: DayRecord;
  let band: DonationBandDay;
  let windowRows: SampleRow[];

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    a = await seed(store, 'AA:01');
    record = a.records[1] as DayRecord;
    band = bandOf(a, record);
    windowRows = a.rows.filter((r) => r.t >= record.start && r.t < record.end);
  });
  afterEach(async () => {
    await store.driver.close();
  });

  async function extraChunk(frames: Uint8Array[], eventT: number): Promise<number> {
    const event = encodeEvent({ event: 3, unixS: eventT });
    const row: EventRow = { deviceId: a.deviceId, t: eventT, event: 3, name: 'BATTERY_LEVEL', payloadHex: '' };
    return commit(store, a.deviceId, [...frames, event], [], [row]);
  }

  it('returns one day of frames in time order without duplicates', async () => {
    const repeated = windowRows.slice(0, 100).map((row) => toFrame(row, a.rows.indexOf(row)));
    await extraChunk(repeated, record.start + 200);
    const removed = emptyRemovalCounts();
    const frames = await collectBandDayFrames(store, band, null, [], removed);
    const times = frames.map((f) => f.t);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(new Set(frames.map((f) => frameHex(f.frame))).size).toBe(frames.length);
    expect(frames).toHaveLength(windowRows.length + 1);
    expect(removed.duplicate).toBe(100);
  });

  it('skips a corrupt chunk and counts it', async () => {
    const chunkId = (
      await store.driver.all<{ chunk_id: number }>(
        'SELECT chunk_id FROM samples_1hz WHERE device_id = ? AND t >= ? ORDER BY t LIMIT 1',
        [a.deviceId, record.start],
      )
    )[0]?.chunk_id;
    await store.driver.run("UPDATE raw_chunks SET frames = X'00' WHERE id = ?", [chunkId ?? -1]);
    const removed = emptyRemovalCounts();
    const frames = await collectBandDayFrames(store, band, null, [], removed);
    expect(removed.corruptChunk).toBe(1);
    expect(frames.length).toBeLessThan(windowRows.length);
  });

  it('drops frames from before owner_since', async () => {
    const removed = emptyRemovalCounts();
    const frames = await collectBandDayFrames(store, band, record.start + 600, [], removed);
    expect(removed.beforeOwner).toBe(windowRows.filter((r) => r.t < record.start + 600).length);
    expect(frames.every((f) => f.t >= record.start + 600)).toBe(true);
  });

  it('removes identity frames found in the window', async () => {
    const leak = encodeConsole({ consoleSequence: 1, unixS: record.start + 300, text: 'id 5AG1234567' });
    await extraChunk([leak], record.start + 301);
    const removed = emptyRemovalCounts();
    const frames = await collectBandDayFrames(store, band, null, [], removed);
    expect(removed.serialText).toBe(1);
    expect(frames.some((f) => frameHex(f.frame) === frameHex(leak))).toBe(false);
  });

  it('drops every fragment of a console line that names an identity, across chunks, and counts each frame once', async () => {
    const at = record.start + 400;
    const line = (sequence: number, text: string, offset: number): Uint8Array =>
      encodeConsole({ consoleSequence: sequence, unixS: at + offset, text });
    const head = line(1, '\n 30, 2372293640: Address          = 02:1A:2B', 0);
    const tail = line(2, ':3C:4D:5E\n 30, 2372467563: NFC COMMS: HW family : 12\n', 1);
    const harmless = line(3, ' 30, 2372467564: NFC COMMS: FW version: 3.30.5.0\n', 2);
    const serial = line(4, ' 30, 5: id 5AG1234567\n', 3);
    const afterGap = line(9, '3d4e5f\n', 4);
    const whole = line(10, ' 30, 6: WEAR: moving\n', 5);
    await extraChunk([head], at + 10);
    await extraChunk([tail, harmless, serial, afterGap, whole], at + 11);
    const removed = emptyRemovalCounts();
    const frames = await collectBandDayFrames(store, band, null, [], removed);
    const donated = new Set(frames.map((f) => frameHex(f.frame)));
    expect([head, tail, harmless, serial, afterGap, whole].map((f) => donated.has(frameHex(f)))).toEqual([false, false, true, false, false, true]);
    expect(removed).toMatchObject({ consoleIdentity: 2, serialText: 1, consolePartial: 1, duplicate: 0 });
  });

  it('counts a repeated copy of a dropped console fragment once per copy, under one reason', async () => {
    const at = record.start + 500;
    const head = encodeConsole({ consoleSequence: 1, unixS: at, text: '\n 30, 5: peer 0a1b2c' });
    const tail = encodeConsole({ consoleSequence: 2, unixS: at + 1, text: '3d4e5f\n' });
    await extraChunk([head], at + 10);
    await extraChunk([head, tail], at + 11);
    const removed = emptyRemovalCounts();
    const frames = await collectBandDayFrames(store, band, null, [], removed);
    expect(frames.some((f) => [frameHex(head), frameHex(tail)].includes(frameHex(f.frame)))).toBe(false);
    expect(removed).toMatchObject({ consoleIdentity: 3, consolePartial: 0, duplicate: 0 });
  });
});
