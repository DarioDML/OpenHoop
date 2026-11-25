import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Profile } from '@stoop/analytics';
import { decodeFrame, toHex } from '@stoop/protocol';
import {
  Session,
  openStore,
  probeLock,
  rebuildFromRaw,
  recomputeDays,
  recordHeartRate,
  syncHistory,
} from '@stoop/core';
import type { Clock, DayRecord, SampleRow, Store, SyncResult } from '@stoop/core';
import { openNodeDriver } from '@stoop/core/node';
import { SimBand } from '../src/index';
import type { SimOptions } from '../src/index';

const NOW_S = Date.UTC(2027, 0, 15, 12, 0, 0) / 1000;
const DAY_S = 86_400;
const TZ_S = 3_600;
const PROFILE: Profile = { maxHr: 190, birthYear: null, restingHr: null };
const COMMAND_ABORT_HISTORICAL = 20;
const COMMAND_HISTORICAL_RESULT = 23;
const COMMAND_PACKET_TYPE = 35;

function simOptions(overrides: Partial<SimOptions> = {}): SimOptions {
  return { seed: 7, now: () => NOW_S, historyDays: 1 / 24, liveIntervalMs: 20, ...overrides };
}

function scaledClock(divisor: number): Clock {
  return {
    now: () => NOW_S * 1000,
    schedule: (ms, fn) => {
      const handle = setTimeout(fn, Math.max(1, Math.ceil(ms / divisor)));
      return () => clearTimeout(handle);
    },
  };
}

async function openSession(band: SimBand, clock: Clock = scaledClock(1)): Promise<Session> {
  const [found] = await band.scan(1000);
  if (found === undefined) throw new Error('simulated band not found');
  await band.connect(found.id);
  await band.bond();
  const session = new Session(band, { clock });
  await session.open();
  return session;
}

async function newStore(ownerSince: number | null = null): Promise<{ store: Store; deviceId: number }> {
  const store = await openStore(openNodeDriver(':memory:'));
  const device = await store.upsertDevice({
    bleId: 'sim:7',
    name: 'WHOOP SIM',
    model: '5.0',
    firmware: '50.38.1.0',
    serial: 'SIM-7',
    ownerSince,
    configSnapshot: null,
  });
  return { store, deviceId: device.id };
}

async function allSamples(store: Store, deviceId: number): Promise<SampleRow[]> {
  return store.samplesBetween(deviceId, 0, 2 ** 40);
}

function key(sample: SampleRow): string {
  return JSON.stringify({ ...sample, chunkId: null });
}

async function syncOnce(
  band: SimBand,
  store: Store,
  deviceId: number,
  idleTimeoutMs = 15_000,
): Promise<SyncResult> {
  const session = await openSession(band);
  try {
    return await syncHistory(session, store, { deviceId, idleTimeoutMs });
  } finally {
    await session.close();
  }
}

async function syncUntilComplete(band: SimBand, store: Store, deviceId: number, idleTimeoutMs: number): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await syncOnce(band, store, deviceId, idleTimeoutMs);
    results.push(result);
    if (result.stoppedBy === 'complete') return results;
  }
  throw new Error(`sync did not converge: ${results.map((r) => r.stoppedBy).join(', ')}`);
}

function expectNoRestrictedCommands(band: SimBand): void {
  expect(band.forbiddenReceived).toBe(0);
  expect(band.writesReceived).toBe(0);
  expect(band.dangerousReceived).toBe(0);
}

function commandsReceived(band: SimBand): number[] {
  const out: number[] = [];
  for (const entry of band.wireLog) {
    if (entry.dir !== 'in') continue;
    const frame = Uint8Array.from(entry.hex.match(/../g)?.map((byte) => parseInt(byte, 16)) ?? []);
    if (frame[8] === COMMAND_PACKET_TYPE && frame[10] !== undefined) out.push(frame[10]);
  }
  return out;
}

async function referenceSamples(historyDays: number): Promise<Map<number, string>> {
  const { store, deviceId } = await newStore();
  const band = new SimBand(simOptions({ historyDays }));
  await syncOnce(band, store, deviceId);
  const samples = await allSamples(store, deviceId);
  await store.driver.close();
  return new Map(samples.map((s) => [s.t, key(s)]));
}

describe('three simulated days through sync and pipeline', () => {
  let store: Store;
  let deviceId: number;
  let band: SimBand;
  let first: SyncResult;
  let second: SyncResult;
  let samplesAfterFirst: number;
  let samplesAfterSecond: number;
  let days: DayRecord[];

  const recompute = (): Promise<DayRecord[]> =>
    recomputeDays(store, { deviceId, from: 0, to: NOW_S + DAY_S, profile: PROFILE, tzOffsetS: TZ_S });

  beforeAll(async () => {
    ({ store, deviceId } = await newStore());
    band = new SimBand(simOptions({ historyDays: 3 }));
    first = await syncOnce(band, store, deviceId);
    samplesAfterFirst = (await store.sampleRange(deviceId))?.count ?? 0;
    second = await syncOnce(band, store, deviceId);
    samplesAfterSecond = (await store.sampleRange(deviceId))?.count ?? 0;
    days = await recompute();
  }, 120_000);

  afterAll(async () => {
    await store.driver.close();
  });

  it('stores three days of samples and reports complete', () => {
    expect(first.stoppedBy).toBe('complete');
    expect(first.samples).toBeGreaterThan(3 * DAY_S - 60);
    expect(first.samples).toBeLessThan(3 * DAY_S + 60);
    expect(samplesAfterFirst).toBe(first.samples);
    expect(first.unknownFrames).toBe(0);
  });

  it('stores nothing new on a second sync', () => {
    expect(second.stoppedBy).toBe('complete');
    expect(second.samples).toBe(0);
    expect(samplesAfterSecond).toBe(samplesAfterFirst);
  });

  it('never sends a restricted command', () => {
    expectNoRestrictedCommands(band);
  });

  it('turns the complete days into ok sleep, HRV, readiness and load', () => {
    const complete = days.filter((d) => d.sleep.periods.some((p) => !p.nap) && d.end - d.start >= 20 * 3_600);
    expect(complete.length).toBeGreaterThanOrEqual(2);
    for (const day of complete) {
      expect(day.sleep.score.reason).toBeNull();
      expect(day.sleep.score.value).not.toBeNull();
      expect(day.hrv.reason).toBeNull();
      expect(day.hrv.value).not.toBeNull();
      expect(day.readiness.reason).toBeNull();
      expect(day.readiness.value).not.toBeNull();
      expect(day.load.reason).toBeNull();
      expect(day.load.value).not.toBeNull();
    }
  });

  it('rebuilds the same day records from the raw archive', async () => {
    const before = await store.listDays(deviceId, '0000-01-01', '9999-12-31');
    const samplesBefore = (await allSamples(store, deviceId)).map(key);
    const rebuilt = await rebuildFromRaw(store, deviceId);
    expect(await store.listDays(deviceId, '0000-01-01', '9999-12-31')).toEqual([]);
    const again = await recompute();
    expect(rebuilt.samples).toBe(samplesAfterFirst);
    expect((await allSamples(store, deviceId)).map(key)).toEqual(samplesBefore);
    expect(JSON.stringify(again)).toBe(JSON.stringify(days));
    expect(JSON.stringify(await store.listDays(deviceId, '0000-01-01', '9999-12-31'))).toBe(JSON.stringify(before));
  }, 120_000);
});

describe('faults', () => {
  let reference: Map<number, string>;

  beforeAll(async () => {
    reference = await referenceSamples(1 / 24);
  }, 60_000);

  it('converges after a disconnect in the middle of a chunk and a resume on a new session', async () => {
    const { store, deviceId } = await newStore();
    const band = new SimBand(simOptions({ faults: { disconnectAfterFrames: 700 } }));
    const results = await syncUntilComplete(band, store, deviceId, 2_000);
    expect(results[0]?.stoppedBy).toBe('disconnect');
    expect(results[0]?.chunks).toBeGreaterThanOrEqual(1);
    expect(results[results.length - 1]?.stoppedBy).toBe('complete');
    const samples = await allSamples(store, deviceId);
    expect(new Map(samples.map((s) => [s.t, key(s)]))).toEqual(reference);
    expect(samples.length).toBe(reference.size);
    expectNoRestrictedCommands(band);
    await store.driver.close();
  });

  it('converges after a lost acknowledgement', async () => {
    const { store, deviceId } = await newStore();
    const band = new SimBand(simOptions({ faults: { dropAckOnce: true } }));
    const results = await syncUntilComplete(band, store, deviceId, 400);
    expect(results[0]?.stoppedBy).toBe('idle');
    expect(results[results.length - 1]?.stoppedBy).toBe('complete');
    const samples = await allSamples(store, deviceId);
    expect(new Map(samples.map((s) => [s.t, key(s)]))).toEqual(reference);
    expectNoRestrictedCommands(band);
    await store.driver.close();
  });

  it('lets no invalid frame reach the store when fragments are corrupted', async () => {
    const { store, deviceId } = await newStore();
    const band = new SimBand(simOptions({ faults: { corruptEveryNthFragment: 1_000 } }));
    const session = await openSession(band);
    const result = await syncHistory(session, store, { deviceId, idleTimeoutMs: 400 });
    await session.close();
    expect(result.samples).toBeLessThan(reference.size);
    expect(result.samples).toBeGreaterThan(1_000);
    for (const chunkId of await store.listChunkIds(deviceId)) {
      for (const frame of await store.readChunkFrames(chunkId)) {
        expect(() => decodeFrame(frame), toHex(frame)).not.toThrow();
      }
    }
    for (const sample of await allSamples(store, deviceId)) {
      expect(key(sample)).toBe(reference.get(sample.t));
    }
    expectNoRestrictedCommands(band);
    await store.driver.close();
  });
});

describe('owner since', () => {
  it('stores nothing older than ownerSince and still reaches complete', async () => {
    const ownerSince = NOW_S - 1_800;
    const { store, deviceId } = await newStore(ownerSince);
    const band = new SimBand(simOptions());
    const result = await syncOnce(band, store, deviceId);
    expect(result.stoppedBy).toBe('complete');
    expect(result.discardedBeforeOwner).toBeGreaterThan(1_700);
    expect(result.discardedBeforeOwner).toBeLessThan(1_900);
    expect(result.samples).toBeGreaterThan(1_700);
    expect(result.samples).toBeLessThan(1_900);
    const range = await store.sampleRange(deviceId);
    expect(range?.first).toBeGreaterThanOrEqual(ownerSince);
    for (const chunkId of await store.listChunkIds(deviceId)) {
      for (const frame of await store.readChunkFrames(chunkId)) {
        const packet = decodeFrame(frame);
        if (packet.kind === 'record') expect(packet.unixS).toBeGreaterThanOrEqual(ownerSince);
      }
    }
    expect((await store.getSyncState(deviceId))?.lastEndToken).not.toBeNull();
    expectNoRestrictedCommands(band);
    await store.driver.close();
  });
});

describe('lock probe and heart rate fallback', () => {
  it('reports open for an unlocked band and never acknowledges history', async () => {
    const band = new SimBand(simOptions({ firmware: '50.38.1.0' }));
    const session = await openSession(band, scaledClock(20));
    const probe = await probeLock(session);
    await session.close();
    expect(probe.state).toBe('open');
    const commands = commandsReceived(band);
    expect(commands).toContain(COMMAND_ABORT_HISTORICAL);
    expect(commands).not.toContain(COMMAND_HISTORICAL_RESULT);
    expectNoRestrictedCommands(band);
  });

  it('reports locked for firmware 50.43.2.0 that withholds data, while the standard heart rate still records', async () => {
    const band = new SimBand(simOptions({ firmware: '50.43.2.0', locked: true }));
    const { store, deviceId } = await newStore();
    const session = await openSession(band, scaledClock(20));
    const probe = await probeLock(session);
    await session.close();
    expect(probe.state).toBe('locked');
    expect(probe.sawHistory).toBe(false);
    expect(probe.sawRealtime).toBe(false);
    const commands = commandsReceived(band);
    expect(commands).toContain(COMMAND_ABORT_HISTORICAL);
    expect(commands).not.toContain(COMMAND_HISTORICAL_RESULT);

    const started = Date.now();
    const virtual: Clock = {
      now: () => NOW_S * 1000 + (Date.now() - started) * 50,
      schedule: (ms, fn) => {
        const handle = setTimeout(fn, Math.max(1, Math.ceil(ms / 50)));
        return () => clearTimeout(handle);
      },
    };
    await band.connect('sim:7');
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 1_500);
    let beats = 0;
    const recorded = await recordHeartRate(band, store, {
      deviceId,
      signal: abort.signal,
      clock: virtual,
      onBeat: () => {
        beats += 1;
      },
    });
    expect(beats).toBeGreaterThan(20);
    expect(recorded.seconds).toBeGreaterThanOrEqual(10);
    const samples = await allSamples(store, deviceId);
    expect(samples.length).toBe(recorded.seconds);
    for (const sample of samples) {
      expect(sample.source).toBe('hrm');
      expect(sample.hr ?? 0).toBeGreaterThan(25);
      expect(sample.hr ?? 0).toBeLessThan(230);
    }
    expectNoRestrictedCommands(band);
    await store.driver.close();
  });

  it('reports no-data for older firmware that stays silent', async () => {
    const band = new SimBand(simOptions({ firmware: '50.38.1.0', locked: true }));
    const session = await openSession(band, scaledClock(20));
    const probe = await probeLock(session);
    await session.close();
    expect(probe.state).toBe('no-data');
    expectNoRestrictedCommands(band);
  });
});
