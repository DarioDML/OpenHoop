import {
  Session,
  driverContract,
  openStore,
  rebuildFromRaw,
  recomputeDays,
  syncHistory,
  type SampleRow,
  type SqlDriver,
} from '@stoop/core';
import { SimBand } from '@stoop/sim';
import { getRandomBytes } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import { defaultDatabaseDirectory, deleteDatabaseAsync } from 'expo-sqlite';

import { openExpoDriver } from '@/data/expoSqliteDriver';
import type { TranslationKey } from '@/i18n';
import { deviceTzOffsetS } from '@/lib/dates';
import { toFileUri } from '@/lib/paths';

export type CheckStatus = 'passed' | 'failed';

export interface CheckResult {
  id: string;
  group: 'driver' | 'app';
  label: string | { key: TranslationKey };
  status: CheckStatus;
  error: string | null;
  ms: number;
  detail: string | null;
}

const SIM_SEED = 4242;
const SIM_HOURS = 6;
const SQLITE_MAGIC = 'SQLite format 3';
const HEADER_BYTES = 16;
const LIVE_DURING_REBUILD = 25;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function databaseDirectory(): Directory {
  return new Directory(toFileUri(defaultDatabaseDirectory));
}

function databaseFile(name: string): File {
  return new File(databaseDirectory(), name);
}

async function headerText(name: string): Promise<string> {
  const handle = databaseFile(name).open();
  try {
    const bytes = await handle.readBytes(HEADER_BYTES);
    return String.fromCharCode(...bytes);
  } finally {
    handle.close();
  }
}

export async function runSelfTest(onResult: (result: CheckResult) => void): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const stamp = Date.now();
  const names: string[] = [];
  const key = getRandomBytes(32);
  let counter = 0;
  const nextName = (): string => {
    counter += 1;
    const name = `selftest-${stamp}-${counter}.db`;
    names.push(name);
    return name;
  };

  const record = async (
    id: string,
    group: CheckResult['group'],
    label: CheckResult['label'],
    run: () => Promise<string | null>,
  ): Promise<void> => {
    const started = Date.now();
    let status: CheckStatus = 'passed';
    let error: string | null = null;
    let detail: string | null = null;
    try {
      detail = await run();
    } catch (caught) {
      status = 'failed';
      error = message(caught);
    }
    const result: CheckResult = { id, group, label, status, error, ms: Date.now() - started, detail };
    results.push(result);
    onResult(result);
  };

  for (const check of driverContract(() => openExpoDriver(nextName(), key))) {
    await record(`driver:${check.name}`, 'driver', check.name, async () => {
      await check.run();
      return null;
    });
  }

  await record('encrypted', 'app', { key: 'selftest.encrypted' }, async () => {
    const name = nextName();
    const driver = await openExpoDriver(name, key);
    await driver.exec('CREATE TABLE secret (v TEXT)');
    await driver.run('INSERT INTO secret (v) VALUES (?)', ['plain-marker-4f1c']);
    await driver.close();
    const header = await headerText(name);
    if (header.startsWith(SQLITE_MAGIC)) throw new Error('the file starts with the plain SQLite header');
    return null;
  });

  await record('wrong-key', 'app', { key: 'selftest.wrongKey' }, async () => {
    const name = nextName();
    const driver = await openExpoDriver(name, key);
    await driver.exec('CREATE TABLE t (v INTEGER)');
    await driver.close();
    let opened = false;
    try {
      const other = await openExpoDriver(name, getRandomBytes(32));
      opened = true;
      await other.close();
    } catch {
      opened = false;
    }
    if (opened) throw new Error('a different key opened the database');
    return null;
  });

  let driver: SqlDriver | null = null;
  let deviceId = 0;
  let lastT = 0;
  let sampleCount = 0;
  const nowS = Math.floor(Date.now() / 1000);

  await record('sync', 'app', { key: 'selftest.sync' }, async () => {
    driver = await openExpoDriver(nextName(), key);
    const store = await openStore(driver);
    const device = await store.upsertDevice({
      bleId: `sim:${SIM_SEED}`,
      name: 'selftest',
      model: '5.0',
      firmware: null,
      serial: null,
      ownerSince: nowS - SIM_HOURS * 3600 - 3600,
      configSnapshot: null,
    });
    deviceId = device.id;
    const band = new SimBand({ seed: SIM_SEED, now: () => Date.now() / 1000, historyDays: SIM_HOURS / 24 });
    await band.connect(`sim:${SIM_SEED}`);
    await band.bond();
    const session = new Session(band, { now: () => Date.now() });
    await session.open();
    const result = await syncHistory(session, store, { deviceId });
    await session.close();
    await band.disconnect();
    if (result.stoppedBy !== 'complete') throw new Error(`sync stopped early: ${result.stoppedBy}`);
    const range = await store.sampleRange(deviceId);
    if (range === null) throw new Error('no samples were stored');
    sampleCount = range.count;
    lastT = range.last;
    const expected = SIM_HOURS * 3600;
    if (range.count < expected * 0.99) throw new Error(`expected about ${expected} samples, stored ${range.count}`);
    return `${result.chunks} chunks, ${range.count} samples`;
  });

  await record('pipeline', 'app', { key: 'selftest.pipeline' }, async () => {
    if (driver === null) throw new Error('the sync check did not produce a database');
    const store = await openStore(driver);
    const days = await recomputeDays(store, {
      deviceId,
      from: 0,
      to: lastT + 1,
      profile: { maxHr: null, birthYear: 1990, restingHr: null },
      tzOffsetS: deviceTzOffsetS(new Date()),
    });
    const stored = await store.listDays(deviceId, '0000-01-01', '9999-12-31');
    if (stored.length !== days.length) throw new Error(`recompute returned ${days.length} days, store holds ${stored.length}`);
    return `${days.length} days from ${sampleCount} samples`;
  });

  await record('concurrent', 'app', { key: 'selftest.concurrent' }, async () => {
    if (driver === null) throw new Error('the sync check did not produce a database');
    const store = await openStore(driver);
    const live = (offset: number): SampleRow => ({
      deviceId,
      t: lastT + 1 + offset,
      source: 'live',
      hr: 70,
      rr: [850],
      steps: null,
      skinTempC: null,
      spo2Raw: null,
      state: null,
      motionG: null,
      chunkId: null,
    });
    const opts = {
      deviceId,
      from: 0,
      to: lastT + 1,
      profile: { maxHr: null, birthYear: 1990, restingHr: null },
      tzOffsetS: deviceTzOffsetS(new Date()),
    };
    const dayKeys = async (): Promise<string> =>
      (await store.listDays(deviceId, '0000-01-01', '9999-12-31')).map((day) => day.day).join(',');
    const before = await dayKeys();
    const inserts: Promise<number>[] = [];
    const rebuilt = rebuildFromRaw(store, deviceId);
    for (let i = 0; i < LIVE_DURING_REBUILD; i++) inserts.push(store.insertSamples([live(i)]));
    const { samples } = await rebuilt;
    const recomputed = recomputeDays(store, opts);
    for (let i = LIVE_DURING_REBUILD; i < 2 * LIVE_DURING_REBUILD; i++) inserts.push(store.insertSamples([live(i)]));
    const days = await recomputed;
    const inserted = (await Promise.all(inserts)).reduce((sum, n) => sum + n, 0);
    if (inserted !== 2 * LIVE_DURING_REBUILD) throw new Error(`${inserted} of ${2 * LIVE_DURING_REBUILD} live samples were stored`);
    if (samples !== sampleCount) throw new Error(`rebuild restored ${samples} of ${sampleCount} samples`);
    const range = await store.sampleRange(deviceId);
    if (range?.count !== sampleCount + inserted) throw new Error(`the store holds ${range?.count ?? 0} samples`);
    const after = await dayKeys();
    if (after !== before || days.length === 0) throw new Error(`days before ${before}, after ${after}`);
    return `${inserted} live samples, ${days.length} days intact`;
  });

  await record('cleanup', 'app', { key: 'selftest.cleanup' }, async () => {
    if (driver !== null) await driver.close();
    for (const name of names) {
      try {
        await deleteDatabaseAsync(name);
      } catch {
        // a database that never got created has no file to delete
      }
    }
    const leftovers = databaseDirectory()
      .list()
      .filter((entry) => entry.name.startsWith(`selftest-${stamp}`));
    if (leftovers.length > 0) throw new Error(`${leftovers.length} temporary files remain`);
    return null;
  });

  return results;
}
