import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GATT,
  encodeBiometric,
  encodeConsole,
  encodeEvent,
  encodeMetadata,
  encodeUnknownRecord,
  toHex,
} from '@openhoop/protocol';
import {
  MAX_CLOCK_OFFSET_S,
  MAX_DAMAGED_ATTEMPTS,
  MAX_HISTORY_REREQUESTS,
  OwnerSinceRequiredError,
  Session,
  openStore,
  probeLock,
  syncHistory,
} from '../src/index';
import type { DeviceRow, SampleRow, SqlDriver, SqlValue, Store } from '../src/index';
import { openNodeDriver } from '../src/node/index';
import type { BandScript, Emit, Outgoing } from './fakeTransport';
import { FakeTransport, VirtualClock, biometricChunk, historyComplete, reply, scriptBand, token } from './fakeTransport';

const T0 = 1_799_990_000;

const DEVICE: Omit<DeviceRow, 'id'> = {
  bleId: 'AA:BB',
  name: 'WHOOP',
  model: '5.0',
  firmware: '50.38.1.0',
  serial: null,
  ownerSince: T0,
  configSnapshot: null,
};

function damagedChunk(): { stream: Uint8Array[]; corrupt: Uint8Array; headerBroken: Uint8Array } {
  const chunk = biometricChunk(0, { firstT: T0, count: 4 });
  const corrupt = encodeBiometric({ recordIndex: 999, unixS: T0 + 50, heartRate: 99 });
  corrupt[corrupt.length - 1] = (corrupt[corrupt.length - 1] ?? 0) ^ 0xff;
  const headerBroken = encodeBiometric({ recordIndex: 998, unixS: T0 + 51, heartRate: 98 });
  headerBroken[6] = (headerBroken[6] ?? 0) ^ 0xff;
  return { stream: [...chunk.slice(0, 2), corrupt, headerBroken, ...chunk.slice(2)], corrupt, headerBroken };
}

function recordingDriver(inner: SqlDriver, log: string[], hooks: { afterCommit?: () => void }): SqlDriver {
  return {
    exec: (sql) => inner.exec(sql),
    run: (sql, params) => inner.run(sql, params),
    all<T extends Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]> {
      return inner.all<T>(sql, params);
    },
    async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
      const result = await inner.transaction(fn);
      log.push('commit');
      hooks.afterCommit?.();
      return result;
    },
    close: () => inner.close(),
  };
}

let log: string[];
let hooks: { afterCommit?: () => void };
let store: Store;
let deviceId: number;
let transports: FakeTransport[];

beforeEach(async () => {
  log = [];
  hooks = {};
  transports = [];
  store = await openStore(recordingDriver(openNodeDriver(':memory:'), log, hooks));
  const device = await store.upsertDevice(DEVICE);
  deviceId = device.id;
  log.length = 0;
});

afterEach(async () => {
  for (const transport of transports) {
    for (const cls of transport.classesSent()) expect(['read', 'session']).toContain(cls);
  }
  await store.driver.close();
});

async function band(script: Omit<BandScript, 'clock'>): Promise<{ transport: FakeTransport; session: Session; clock: VirtualClock }> {
  const clock = new VirtualClock(T0 * 1000 + 50_000_000);
  const transport = new FakeTransport();
  transports.push(transport);
  scriptBand(transport, { clock, ...script });
  transport.onWrite = (out) => {
    if (out.command === 23) log.push(`ack:${toHex(out.args.subarray(1, 9))}`);
    if (out.command === 20) log.push('abort');
  };
  const session = new Session(transport, { clock });
  await session.open();
  return { transport, session, clock };
}

async function sampleCount(): Promise<number> {
  return (await store.sampleRange(deviceId))?.count ?? 0;
}

// An MG band (50.43.2.0) keeps a served chunk pending until it is acknowledged: every later history request,
// aborted or not, gets only that chunk's HISTORY_END again, and acknowledging that lone HISTORY_END does not
// start the next chunk on its own.
function pendingAckBand(chunks: Uint8Array[][], complete: Uint8Array): (out: Outgoing, emit: Emit) => boolean {
  let next = 0;
  let pending: number | null = null;
  let serving = false;
  const serve = (emit: Emit): void => {
    const chunk = chunks[next];
    if (chunk === undefined) {
      emit(GATT.dataFromStrap, complete);
      return;
    }
    pending = next;
    for (const frame of chunk) emit(GATT.dataFromStrap, frame);
  };
  return (out, emit) => {
    if (out.command === 22) {
      emit(GATT.cmdFromStrap, reply(out));
      serving = pending === null;
      if (pending === null) serve(emit);
      else emit(GATT.dataFromStrap, encodeMetadata({ meta: 'HISTORY_END', unixS: T0 + 900, endToken: token(pending) }));
      return true;
    }
    if (out.command === 23) {
      if (pending !== null && toHex(out.args.subarray(1, 9)) === toHex(token(pending))) {
        pending = null;
        next += 1;
        if (serving) serve(emit);
      }
      return true;
    }
    if (out.command === 20) {
      serving = false;
      emit(GATT.cmdFromStrap, reply(out));
      return true;
    }
    return false;
  };
}

describe('syncHistory after the lock probe', () => {
  const chunks = (): Uint8Array[][] => [0, 1, 2].map((n) => biometricChunk(n, { firstT: T0 + n * 100, count: 10 }));

  it('commits the chunk the probe held when the band answers with only its HISTORY_END', async () => {
    const { session } = await band({ onCommand: pendingAckBand(chunks(), historyComplete(T0 + 500)) });
    const probe = await probeLock(session);
    expect(probe.state).toBe('open');
    expect(probe.heldChunk?.endToken).toEqual(token(0));

    const result = await syncHistory(session, store, { deviceId, heldChunk: probe.heldChunk });

    expect(result).toMatchObject({ chunks: 3, samples: 30, stoppedBy: 'complete' });
    expect(log.filter((l) => l.startsWith('ack'))).toEqual([0, 1, 2].map((n) => `ack:${toHex(token(n))}`));
    expect(await sampleCount()).toBe(30);
  });

  it('without the held chunk it cannot get past the pending chunk and acknowledges nothing', async () => {
    const { session } = await band({ onCommand: pendingAckBand(chunks(), historyComplete(T0 + 500)) });
    await probeLock(session);

    const result = await syncHistory(session, store, { deviceId });

    expect(result.chunks).toBe(0);
    expect(result.stoppedBy).not.toBe('complete');
    expect(log.filter((l) => l.startsWith('ack'))).toEqual([]);
  });

  it('ignores a held chunk whose token does not match the HISTORY_END', async () => {
    const { session } = await band({ onCommand: pendingAckBand(chunks(), historyComplete(T0 + 500)) });
    const probe = await probeLock(session);
    const held = probe.heldChunk;
    if (held === null) throw new Error('probe held nothing');

    const result = await syncHistory(session, store, { deviceId, heldChunk: { ...held, endToken: token(7) } });

    expect(result.chunks).toBe(0);
    expect(log.filter((l) => l.startsWith('ack'))).toEqual([]);
  });
});

describe('syncHistory', () => {
  it('stores three chunks with three acknowledgements, each after its commit', async () => {
    const chunks = [0, 1, 2].map((n) => biometricChunk(n, { firstT: T0 + n * 100, count: 10 }));
    const { session, transport } = await band({ chunks, complete: historyComplete(T0 + 500) });
    const progress: number[] = [];
    const result = await syncHistory(session, store, { deviceId, onProgress: (p) => progress.push(p.chunks) });
    expect(result).toEqual({
      chunks: 3,
      frames: 36,
      samples: 30,
      discardedBeforeOwner: 0,
      unknownFrames: 0,
      stoppedBy: 'complete',
    });
    expect(log).toEqual([
      'commit',
      `ack:${toHex(token(0))}`,
      'commit',
      `ack:${toHex(token(1))}`,
      'commit',
      `ack:${toHex(token(2))}`,
    ]);
    expect(progress).toEqual([1, 2, 3]);
    expect(await store.listChunkIds(deviceId)).toHaveLength(3);
    expect(await sampleCount()).toBe(30);
    const state = await store.getSyncState(deviceId);
    expect(state?.lastEndToken).toEqual(token(2));
    expect(state?.newestSampleT).toBe(T0 + 209);
    expect(state?.writePage).toBe(1_040);
    expect(state?.trimPage).toBe(1_000);
    expect(transport.commandsSent()).not.toContain(20);
    const acks = transport.writes.filter((w) => w.command === 23);
    expect(acks.map((a) => a.args.subarray(0, 9))).toEqual([0, 1, 2].map((n) => Uint8Array.of(1, ...token(n))));
  });

  it('a drop after commit and before the acknowledgement re-serves the chunk without duplicating samples', async () => {
    const chunks = [0, 1].map((n) => biometricChunk(n, { firstT: T0 + n * 100, count: 10 }));
    const first = await band({ chunks, complete: historyComplete(T0 + 500) });
    hooks.afterCommit = () => first.transport.dropLink();
    const interrupted = await syncHistory(first.session, store, { deviceId });
    hooks.afterCommit = undefined;
    expect(interrupted.stoppedBy).toBe('disconnect');
    expect(interrupted.chunks).toBe(1);
    expect(interrupted.samples).toBe(10);
    expect(log.filter((l) => l.startsWith('ack'))).toEqual([]);
    expect(await sampleCount()).toBe(10);
    const stateAfterDrop = await store.getSyncState(deviceId);

    const second = await band({ chunks: [chunks[0] ?? []], complete: historyComplete(T0 + 500) });
    const again = await syncHistory(second.session, store, { deviceId });
    expect(again.stoppedBy).toBe('complete');
    expect(await sampleCount()).toBe(10);
    const state = await store.getSyncState(deviceId);
    expect(state?.lastEndToken).toEqual(token(0));
    expect(state?.newestSampleT).toBe(stateAfterDrop?.newestSampleT);
    expect(second.transport.writes.filter((w) => w.command === 23)).toHaveLength(1);
  });

  it('sends no acknowledgement when commitChunk throws', async () => {
    const chunks = [biometricChunk(0, { firstT: T0, count: 5 })];
    const { session, transport } = await band({ chunks });
    store.commitChunk = async () => {
      throw new Error('disk full');
    };
    await expect(syncHistory(session, store, { deviceId })).rejects.toThrow('disk full');
    expect(transport.commandsSent()).not.toContain(23);
    expect(transport.commandsSent()).toContain(20);
  });

  it('archives an unknown-layout record raw and produces no sample for it', async () => {
    const unknown = encodeUnknownRecord({ layout: 99, recordIndex: 7, unixS: T0 + 3, length: 64 });
    const chunk = [
      encodeMetadata({ meta: 'HISTORY_START', unixS: T0 }),
      encodeBiometric({ recordIndex: 1, unixS: T0 + 1, heartRate: 61 }),
      unknown,
      encodeMetadata({ meta: 'HISTORY_END', unixS: T0 + 4, endToken: token(0) }),
    ];
    const { session } = await band({ chunks: [chunk], complete: historyComplete(T0 + 5) });
    const result = await syncHistory(session, store, { deviceId });
    expect(result.unknownFrames).toBe(1);
    expect(result.samples).toBe(1);
    const [chunkId] = await store.listChunkIds(deviceId);
    expect(chunkId).toBeDefined();
    const frames = await store.readChunkFrames(chunkId ?? -1);
    expect(frames.map(toHex)).toContain(toHex(unknown));
    expect((await store.samplesBetween(deviceId, T0, T0 + 10)).map((s) => s.t)).toEqual([T0 + 1]);
  });

  it('discards records before ownerSince and still acknowledges', async () => {
    const mixed = biometricChunk(0, { firstT: T0 - 5, count: 10 });
    const { session, transport } = await band({ chunks: [mixed], complete: historyComplete(T0 + 50) });
    const result = await syncHistory(session, store, { deviceId });
    expect(result.discardedBeforeOwner).toBe(5);
    expect(result.samples).toBe(5);
    expect(transport.commandsSent()).toContain(23);
    const stored = await store.samplesBetween(deviceId, 0, T0 + 100);
    expect(stored.every((s) => s.t >= T0)).toBe(true);
    const frames = await store.readChunkFrames((await store.listChunkIds(deviceId))[0] ?? -1);
    expect(frames).toHaveLength(7);
  });

  it('acknowledges a chunk of only pre-owner records and stores nothing', async () => {
    const old = biometricChunk(0, { firstT: T0 - 100, count: 10 });
    const { session, transport } = await band({ chunks: [old], complete: historyComplete(T0 + 50) });
    const result = await syncHistory(session, store, { deviceId });
    expect(result).toMatchObject({ chunks: 1, samples: 0, discardedBeforeOwner: 10, stoppedBy: 'complete' });
    expect(transport.writes.filter((w) => w.command === 23)).toHaveLength(1);
    expect(await sampleCount()).toBe(0);
    expect(await store.listChunkIds(deviceId)).toEqual([]);
  });

  it('commits events and console frames buffered between chunks into the next chunk', async () => {
    const between = [encodeEvent({ event: 9, unixS: T0 + 2 }), encodeConsole({ consoleSequence: 4, unixS: T0 + 2, text: 'boot' })];
    const { session, transport } = await band({
      chunks: [[...between, ...biometricChunk(0, { firstT: T0 + 10, count: 2 })]],
      complete: historyComplete(T0 + 50),
    });
    const result = await syncHistory(session, store, { deviceId });
    expect(result.frames).toBe(6);
    expect(transport.commandsSent()).toContain(23);
  });

  it('neither stores nor acknowledges a chunk that stays damaged, and stops with corrupt', async () => {
    const { stream, corrupt, headerBroken } = damagedChunk();
    const { session, transport } = await band({ chunks: [stream], complete: historyComplete(T0 + 60) });
    const result = await syncHistory(session, store, { deviceId });
    expect(result).toMatchObject({ chunks: 0, samples: 0, stoppedBy: 'corrupt' });
    expect(transport.commandsSent().filter((c) => c === 22)).toHaveLength(MAX_DAMAGED_ATTEMPTS);
    expect(transport.commandsSent()).not.toContain(23);
    expect(transport.commandsSent().at(-1)).toBe(20);
    expect(await store.listChunkIds(deviceId)).toEqual([]);
    expect(await sampleCount()).toBe(0);
    expect(log).toEqual(['abort', 'abort', 'abort']);
    expect(transport.wire.some((w) => w.dir === 'in' && toHex(w.data) === toHex(corrupt))).toBe(true);
    expect(transport.wire.some((w) => w.dir === 'in' && toHex(w.data) === toHex(headerBroken))).toBe(true);
  });

  it('re-requests a chunk damaged once and acknowledges it only after an intact copy is stored', async () => {
    const { stream, corrupt } = damagedChunk();
    const clean = biometricChunk(0, { firstT: T0, count: 4 });
    let requests = 0;
    const { session, transport } = await band({
      chunks: [clean],
      complete: historyComplete(T0 + 60),
      onCommand: (out, emit) => {
        if (out.command !== 22) return false;
        requests += 1;
        if (requests > 1) return false;
        emit(GATT.cmdFromStrap, reply(out));
        for (const frame of stream) emit(GATT.dataFromStrap, frame);
        return true;
      },
    });
    const result = await syncHistory(session, store, { deviceId });
    expect(result).toMatchObject({ chunks: 1, samples: 4, stoppedBy: 'complete' });
    const commands = transport.commandsSent();
    expect(commands.filter((c) => c === 22)).toHaveLength(2);
    expect(commands.lastIndexOf(22)).toBeLessThan(commands.indexOf(23));
    expect(commands.indexOf(20)).toBeLessThan(commands.lastIndexOf(22));
    expect(log).toEqual(['abort', 'commit', `ack:${toHex(token(0))}`]);
    const frames = await store.readChunkFrames((await store.listChunkIds(deviceId))[0] ?? -1);
    expect(frames.map(toHex)).toEqual(clean.map(toHex));
    expect(frames.map(toHex)).not.toContain(toHex(corrupt));
    expect((await store.samplesBetween(deviceId, T0, T0 + 100)).map((s) => s.t)).toEqual([T0, T0 + 1, T0 + 2, T0 + 3]);
  });

  it('ignores the tail of an earlier transfer, re-requests, and ends like a clean run', async () => {
    const chunks = [0, 1, 2].map((n) => biometricChunk(n, { firstT: T0 + n * 100, count: 10 }));
    const strayTail = (chunks[0] ?? []).slice(5);
    let requests = 0;
    const { session, transport } = await band({
      chunks,
      complete: historyComplete(T0 + 500),
      onCommand: (out, emit) => {
        if (out.command !== 22) return false;
        requests += 1;
        if (requests > 1) return false;
        emit(GATT.cmdFromStrap, reply(out));
        for (const frame of [...strayTail, ...(chunks[0] ?? [])]) emit(GATT.dataFromStrap, frame);
        return true;
      },
    });
    const result = await syncHistory(session, store, { deviceId });
    expect(result).toMatchObject({ chunks: 3, samples: 30, stoppedBy: 'complete' });

    const commands = transport.commandsSent();
    const secondRequest = commands.lastIndexOf(22);
    expect(commands.filter((c) => c === 22)).toHaveLength(2);
    expect(commands.indexOf(23)).toBeGreaterThan(secondRequest);
    const acks = transport.writes.filter((w) => w.command === 23).map((w) => toHex(w.args.subarray(1, 9)));
    expect(acks).toEqual([0, 1, 2].map((n) => toHex(token(n))));
    for (const chunkId of await store.listChunkIds(deviceId)) {
      const frames = (await store.readChunkFrames(chunkId)).map(toHex);
      const served = chunks.find((c) => toHex(c[c.length - 1] ?? new Uint8Array(0)) === frames[frames.length - 1]);
      expect(frames).toEqual(served?.map(toHex));
    }

    const cleanStore = await openStore(openNodeDriver(':memory:'));
    const cleanDevice = await cleanStore.upsertDevice({ ...DEVICE, ownerSince: T0 });
    const clean = await band({ chunks, complete: historyComplete(T0 + 500) });
    await syncHistory(clean.session, cleanStore, { deviceId: cleanDevice.id });
    const strip = (rows: SampleRow[]): SampleRow[] => rows.map((r) => ({ ...r, deviceId: 0, chunkId: null }));
    expect(strip(await store.samplesBetween(deviceId, 0, 2 ** 40))).toEqual(
      strip(await cleanStore.samplesBetween(cleanDevice.id, 0, 2 ** 40)),
    );
    await cleanStore.driver.close();
  });

  it('gives up with corrupt after a bounded number of re-requests when no transfer ever opens', async () => {
    const headless = (biometricChunk(0, { firstT: T0, count: 5 })).slice(1);
    const { session, transport } = await band({ chunks: [headless] });
    const result = await syncHistory(session, store, { deviceId });
    expect(result.stoppedBy).toBe('corrupt');
    expect(transport.commandsSent().filter((c) => c === 22)).toHaveLength(MAX_HISTORY_REREQUESTS + 1);
    expect(transport.commandsSent()).not.toContain(23);
    expect(await store.listChunkIds(deviceId)).toEqual([]);
  });

  it('throws OwnerSinceRequiredError for a device without an owner date and writes nothing', async () => {
    const unowned = await store.upsertDevice({ ...DEVICE, bleId: 'CC:DD', ownerSince: null });
    const { session, transport } = await band({ chunks: [biometricChunk(0, { firstT: T0, count: 3 })] });
    const before = transport.writes.length;
    await expect(syncHistory(session, store, { deviceId: unowned.id })).rejects.toBeInstanceOf(OwnerSinceRequiredError);
    expect(transport.writes.length).toBe(before);
  });

  it('drops events and console lines dated before ownerSince', async () => {
    const old = [encodeEvent({ event: 9, unixS: T0 - 10 }), encodeConsole({ consoleSequence: 3, unixS: T0 - 10, text: 'old' })];
    const fresh = [encodeEvent({ event: 9, unixS: T0 + 2 }), encodeConsole({ consoleSequence: 4, unixS: T0 + 2, text: 'new' })];
    const { session } = await band({
      chunks: [[...old, ...fresh, ...biometricChunk(0, { firstT: T0 + 10, count: 2 })]],
      complete: historyComplete(T0 + 50),
    });
    const result = await syncHistory(session, store, { deviceId });
    expect(result.frames).toBe(6);
    const events = await store.driver.all<{ t: number }>('SELECT t FROM events');
    const lines = await store.driver.all<{ t: number }>('SELECT t FROM console_log');
    expect(events.map((e) => e.t)).toEqual([T0 + 2]);
    expect(lines.map((e) => e.t)).toEqual([T0 + 2]);
  });

  describe('band clock', () => {
    const NOW_S = T0 + 50_000;
    const cases = [
      { name: 'a sentinel clock', helloUnixS: 0, firstT: 1_000 },
      { name: 'a clock three hours ahead', helloUnixS: NOW_S + 10_800, firstT: T0 - 50 },
    ];

    for (const c of cases) {
      it(`refuses to request or acknowledge anything with ${c.name} in strict mode`, async () => {
        const { session, transport } = await band({
          helloUnixS: c.helloUnixS,
          chunks: [biometricChunk(0, { firstT: c.firstT, count: 10 })],
          complete: historyComplete(c.firstT + 50),
        });
        const result = await syncHistory(session, store, { deviceId });
        expect(result).toMatchObject({ chunks: 0, samples: 0, discardedBeforeOwner: 0, stoppedBy: 'clock' });
        expect(transport.commandsSent()).toEqual([145]);
        expect(await store.listChunkIds(deviceId)).toEqual([]);
      });

      it(`stores everything and discards nothing with ${c.name} in store-all mode`, async () => {
        const { session, transport } = await band({
          helloUnixS: c.helloUnixS,
          chunks: [biometricChunk(0, { firstT: c.firstT, count: 10 })],
          complete: historyComplete(c.firstT + 50),
        });
        const result = await syncHistory(session, store, { deviceId, clockPolicy: 'store-all' });
        expect(result).toMatchObject({ chunks: 1, samples: 10, discardedBeforeOwner: 0, stoppedBy: 'complete' });
        expect(transport.commandsSent()).toContain(23);
        const [chunkId] = await store.listChunkIds(deviceId);
        expect((await store.getChunkMeta(chunkId ?? -1))?.clockOffsetS).toBe(session.clockOffsetS());
      });
    }

    it(`accepts an offset of exactly ${MAX_CLOCK_OFFSET_S} s`, async () => {
      const { session } = await band({
        helloUnixS: NOW_S - MAX_CLOCK_OFFSET_S,
        chunks: [biometricChunk(0, { firstT: T0, count: 3 })],
        complete: historyComplete(T0 + 50),
      });
      expect((await syncHistory(session, store, { deviceId })).stoppedBy).toBe('complete');
    });
  });

  it('reassembles frames split across notifications', async () => {
    const chunk = biometricChunk(0, { firstT: T0, count: 3 });
    const { session } = await band({
      onCommand: (out, emit) => {
        if (out.command !== 22) return false;
        const bytes = chunk.flatMap((f) => [...f]);
        for (let i = 0; i < bytes.length; i += 7) emit(GATT.dataFromStrap, Uint8Array.from(bytes.slice(i, i + 7)));
        return true;
      },
    });
    const result = await syncHistory(session, store, { deviceId, idleTimeoutMs: 1_000 });
    expect(result).toMatchObject({ chunks: 1, samples: 3, stoppedBy: 'idle' });
  });

  it('stops on abort after the current chunk is committed and acknowledged', async () => {
    const chunks = [0, 1, 2].map((n) => biometricChunk(n, { firstT: T0 + n * 100, count: 10 }));
    const { session, transport } = await band({ chunks, complete: historyComplete(T0 + 500) });
    const controller = new AbortController();
    let commits = 0;
    hooks.afterCommit = () => {
      commits += 1;
      if (commits === 2) controller.abort();
    };
    const result = await syncHistory(session, store, { deviceId, signal: controller.signal });
    expect(result).toMatchObject({ chunks: 2, samples: 20, stoppedBy: 'abort' });
    expect(log).toEqual(['commit', `ack:${toHex(token(0))}`, 'commit', `ack:${toHex(token(1))}`, 'abort']);
    expect(await store.listChunkIds(deviceId)).toHaveLength(2);
    expect(await sampleCount()).toBe(20);
    expect((await store.getSyncState(deviceId))?.lastEndToken).toEqual(token(1));
    expect(transport.commandsSent().at(-1)).toBe(20);
  });

  it('reports locked when a 50.43 band sends nothing, idle on older firmware', async () => {
    const locked = await band({ firmware: '50.43.2.0' });
    const lockedResult = await syncHistory(locked.session, store, { deviceId });
    expect(lockedResult.stoppedBy).toBe('locked');
    expect(locked.transport.commandsSent()).toContain(20);
    expect(locked.transport.commandsSent()).not.toContain(23);

    const silent = await band({ firmware: '50.38.1.0' });
    const start = silent.clock.now();
    const silentResult = await syncHistory(silent.session, store, { deviceId, idleTimeoutMs: 15_000 });
    expect(silentResult.stoppedBy).toBe('idle');
    expect(silent.clock.now() - start).toBeGreaterThanOrEqual(15_000);
  });

  it('skips the request when the band reports nothing behind', async () => {
    const { session, transport } = await band({ pagesBehind: 0 });
    const result = await syncHistory(session, store, { deviceId });
    expect(result.stoppedBy).toBe('complete');
    expect(transport.commandsSent()).toEqual([145, 34]);
  });

  it('resolves with disconnect when the link drops mid-chunk and keeps earlier chunks', async () => {
    const chunks = [0, 1].map((n) => biometricChunk(n, { firstT: T0 + n * 100, count: 10 }));
    const { session, transport } = await band({
      onCommand: (out, emit) => {
        if (out.command === 22) {
          for (const f of chunks[0] ?? []) emit(GATT.dataFromStrap, f);
          return true;
        }
        if (out.command === 23) {
          for (const f of (chunks[1] ?? []).slice(0, 4)) emit(GATT.dataFromStrap, f);
          queueMicrotask(() => transport.dropLink());
          return true;
        }
        return false;
      },
    });
    const result = await syncHistory(session, store, { deviceId });
    expect(result).toMatchObject({ chunks: 1, samples: 10, stoppedBy: 'disconnect' });
    expect(await sampleCount()).toBe(10);
  });
});
