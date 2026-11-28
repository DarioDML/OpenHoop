import { Command, isDataLockFirmware, toHex } from '@openhoop/protocol';
import type { DataRange, Packet } from '@openhoop/protocol';
import type { HeldChunk } from './lockProbe';
import { ChunkBuilder } from './store/chunkCodec';
import { packEventFromPacket, sampleFromPacket } from './mapping';
import type { Session } from './session';
import { isLiveSignal } from './rawStreams';
import { emptySignals, mergeSignals, signalRangeOf, signalsFromPacket } from './signals';
import type { SignalRows } from './signals';
import { CommandFailedError, DisconnectedError, LINK_QUIET_MAX_MS, LINK_QUIET_MS } from './session';
import type { ConsoleRow, EventRow, PackEventRow, SampleRow, Store, SyncStateRow } from './store/types';

export const MAX_CLOCK_OFFSET_S = 120;
export const MAX_DAMAGED_ATTEMPTS = 3;
export const MAX_HISTORY_REREQUESTS = 20;

export interface SyncProgress {
  chunks: number;
  frames: number;
  samples: number;
  discardedBeforeOwner: number;
  unknownFrames: number;
  newestSampleT: number | null;
}

export type SyncStop = 'complete' | 'disconnect' | 'abort' | 'idle' | 'locked' | 'clock' | 'corrupt' | 'pending';

// The band answers every request with only the HISTORY_END of a chunk it still holds; after this many, stop asking.
export const MAX_LONE_HISTORY_ENDS = 3;

export interface SyncResult {
  chunks: number;
  frames: number;
  samples: number;
  discardedBeforeOwner: number;
  unknownFrames: number;
  stoppedBy: SyncStop;
  signalRange: { from: number; to: number } | null;
}

export interface SyncOptions {
  deviceId: number;
  onProgress?: (progress: SyncProgress) => void;
  signal?: AbortSignal;
  idleTimeoutMs?: number;
  clockPolicy?: 'strict' | 'store-all';
  heldChunk?: HeldChunk | null;
}

function widen(a: { from: number; to: number } | null, b: { from: number; to: number } | null): { from: number; to: number } | null {
  if (a === null) return b;
  if (b === null) return a;
  return { from: Math.min(a.from, b.from), to: Math.max(a.to, b.to) };
}

function endTokenOf(packet: Packet): Uint8Array | undefined {
  return packet.kind === 'metadata' ? packet.endToken : undefined;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export class OwnerSinceRequiredError extends Error {
  constructor(readonly deviceId: number) {
    super(`device ${deviceId} has no owner-since date; refusing to read history that may belong to a previous owner`);
    this.name = 'OwnerSinceRequiredError';
  }
}

type SyncEvent =
  | { type: 'frame'; packet: Packet; raw: Uint8Array; integrity: number }
  | { type: 'disconnect' }
  | { type: 'abort' }
  | { type: 'idle' }
  | { type: 'failed'; error: CommandFailedError };

class EventQueue {
  private readonly items: SyncEvent[] = [];
  private waiter: ((event: SyncEvent) => void) | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly session: Session,
    signal: AbortSignal | undefined,
  ) {
    this.cleanups.push(
      session.onPacket((packet, raw) => {
        if (packet.kind === 'commandResponse' || packet.kind === 'realtimeHr' || isLiveSignal(packet)) return;
        this.push({ type: 'frame', packet, raw, integrity: session.integrityErrors });
      }),
      session.onDisconnect(() => this.push({ type: 'disconnect' })),
    );
    if (signal !== undefined) {
      const onAbort = (): void => this.push({ type: 'abort' });
      signal.addEventListener('abort', onAbort);
      this.cleanups.push(() => signal.removeEventListener('abort', onAbort));
      if (signal.aborted) this.push({ type: 'abort' });
    }
  }

  push(event: SyncEvent): void {
    const waiter = this.waiter;
    if (waiter !== null) {
      this.waiter = null;
      waiter(event);
    } else {
      this.items.push(event);
    }
  }

  next(timeoutMs: number): Promise<SyncEvent> {
    const priority = this.items.findIndex((e) => e.type === 'disconnect' || e.type === 'abort');
    const queued = priority >= 0 ? this.items.splice(priority, 1)[0] : this.items.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise<SyncEvent>((resolve) => {
      const cancel = this.session.clock.schedule(timeoutMs, () => {
        if (this.waiter !== deliver) return;
        this.waiter = null;
        resolve({ type: 'idle' });
      });
      const deliver = (event: SyncEvent): void => {
        cancel();
        resolve(event);
      };
      this.waiter = deliver;
    });
  }

  close(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.waiter = null;
  }
}

interface ChunkTally {
  chunk: ChunkBuilder;
  samples: SampleRow[];
  events: EventRow[];
  packEvents: PackEventRow[];
  console: ConsoleRow[];
  signals: SignalRows;
  unknownFrames: number;
  discarded: number;
  content: number;
  spontaneous: { packet: Packet; raw: Uint8Array }[];
}

function emptyTally(): ChunkTally {
  return {
    chunk: new ChunkBuilder(),
    samples: [],
    events: [],
    packEvents: [],
    console: [],
    signals: emptySignals(),
    unknownFrames: 0,
    discarded: 0,
    content: 0,
    spontaneous: [],
  };
}

function isChunkMarker(packet: Packet): boolean {
  return packet.kind === 'metadata' && (packet.metaName === 'HISTORY_START' || packet.metaName === 'HISTORY_END');
}

function isMeta(packet: Packet, name: string): packet is Extract<Packet, { kind: 'metadata' }> {
  return packet.kind === 'metadata' && packet.metaName === name;
}

function addFrame(tally: ChunkTally, deviceId: number, ownerFloor: number | null, packet: Packet, raw: Uint8Array): void {
  const before = tally.chunk.frames.length;
  addFrameKind(tally, deviceId, ownerFloor, packet, raw);
  if (tally.chunk.frames.length === before) return;
  if (!isChunkMarker(packet)) tally.content += 1;
  if (packet.kind === 'event' || packet.kind === 'console') tally.spontaneous.push({ packet, raw });
}

function carryOver(damaged: ChunkTally, deviceId: number, ownerFloor: number | null): ChunkTally {
  const next = emptyTally();
  for (const { packet, raw } of damaged.spontaneous) addFrame(next, deviceId, ownerFloor, packet, raw);
  return next;
}

function addFrameKind(tally: ChunkTally, deviceId: number, ownerFloor: number | null, packet: Packet, raw: Uint8Array): void {
  switch (packet.kind) {
    case 'record': {
      if (ownerFloor !== null && packet.unixS < ownerFloor) {
        tally.discarded += 1;
        return;
      }
      tally.chunk.add(raw);
      if (packet.record.type === 'unknown') tally.unknownFrames += 1;
      mergeSignals(tally.signals, signalsFromPacket(deviceId, packet));
      const sample = sampleFromPacket(deviceId, packet);
      if (sample !== null) tally.samples.push({ ...sample, source: 'history' });
      return;
    }
    case 'event':
      if (ownerFloor !== null && packet.unixS < ownerFloor) return;
      tally.chunk.add(raw);
      tally.events.push({
        deviceId,
        t: packet.unixS,
        event: packet.event,
        name: packet.eventName,
        payloadHex: toHex(packet.payload),
      });
      return;
    case 'packEvent': {
      if (ownerFloor !== null && packet.unixS < ownerFloor) return;
      tally.chunk.add(raw);
      const row = packEventFromPacket(deviceId, packet);
      if (row !== null) tally.packEvents.push(row);
      return;
    }
    case 'console':
      if (ownerFloor !== null && packet.unixS < ownerFloor) return;
      tally.chunk.add(raw);
      tally.console.push({ deviceId, t: packet.unixS, sequence: packet.consoleSequence, text: packet.text });
      return;
    case 'unknown':
      tally.chunk.add(raw);
      tally.unknownFrames += 1;
      return;
    default:
      tally.chunk.add(raw);
  }
}

function newest(current: number | null, samples: SampleRow[]): number | null {
  let out = current;
  for (const s of samples) if (out === null || s.t > out) out = s.t;
  return out;
}

export function clockTrusted(offsetS: number | null): boolean {
  return offsetS !== null && Math.abs(offsetS) <= MAX_CLOCK_OFFSET_S;
}

export async function syncHistory(session: Session, store: Store, opts: SyncOptions): Promise<SyncResult> {
  const { deviceId } = opts;
  const idleTimeoutMs = opts.idleTimeoutMs ?? 15_000;
  const clockPolicy = opts.clockPolicy ?? 'strict';
  const device = await store.getDevice(deviceId);
  if (device === null) throw new Error(`device ${deviceId} is not in the store`);
  if (device.ownerSince === null) throw new OwnerSinceRequiredError(deviceId);
  const ownerFloor = clockPolicy === 'strict' ? device.ownerSince : null;

  const totals: SyncResult = {
    chunks: 0,
    frames: 0,
    samples: 0,
    discardedBeforeOwner: 0,
    unknownFrames: 0,
    stoppedBy: 'complete',
    signalRange: null,
  };
  const finish = (stoppedBy: SyncStop): SyncResult => ({ ...totals, stoppedBy });

  // A band clock that restarted near zero dates every new record before ownerSince; filtering on it would destroy them.
  if (clockPolicy === 'strict' && !clockTrusted(session.clockOffsetS())) return finish('clock');
  if (opts.signal?.aborted === true) return finish('abort');

  const previous = await store.getSyncState(deviceId);
  let lastEndToken = previous?.lastEndToken ?? null;
  let newestSampleT = previous?.newestSampleT ?? null;
  let range: DataRange | null = null;

  const progress = (): void =>
    opts.onProgress?.({
      chunks: totals.chunks,
      frames: totals.frames,
      samples: totals.samples,
      discardedBeforeOwner: totals.discardedBeforeOwner,
      unknownFrames: totals.unknownFrames,
      newestSampleT,
    });

  const syncState = (endToken: Uint8Array | null): SyncStateRow => ({
    deviceId,
    lastEndToken: endToken ?? lastEndToken,
    lastSyncAt: Math.floor(session.clock.now() / 1000),
    newestSampleT,
    readPage: range?.readPage ?? previous?.readPage ?? null,
    writePage: range?.writePage ?? previous?.writePage ?? null,
    trimPage: range?.trimPage ?? previous?.trimPage ?? null,
    totalPages: range?.totalPages ?? previous?.totalPages ?? null,
  });

  const commit = async (tally: ChunkTally, endToken: Uint8Array | null): Promise<void> => {
    totals.discardedBeforeOwner += tally.discarded;
    if (tally.content === 0) return;
    const candidateNewest = newest(newestSampleT, tally.samples);
    const state = syncState(endToken);
    state.newestSampleT = candidateNewest;
    await store.commitChunk(
      {
        deviceId,
        endToken,
        frames: tally.chunk.frames,
        encoded: tally.chunk.encode(),
        clockOffsetS: session.clockOffsetS(),
        receivedAt: Math.floor(session.clock.now() / 1000),
      },
      tally.samples,
      {
        events: tally.events,
        packEvents: tally.packEvents,
        console: tally.console,
        signals: tally.signals,
        unknownFrames: tally.unknownFrames,
        syncState: state,
      },
    );
    newestSampleT = candidateNewest;
    if (endToken !== null) lastEndToken = endToken;
    totals.frames += tally.chunk.frames.length;
    totals.samples += tally.samples.length;
    totals.unknownFrames += tally.unknownFrames;
    totals.signalRange = widen(totals.signalRange, signalRangeOf(tally.signals));
  };

  try {
    range = await session.dataRange();
  } catch (error) {
    if (error instanceof DisconnectedError) return finish('disconnect');
    if (!(error instanceof CommandFailedError)) throw error;
  }
  if (range?.pagesBehind === 0) return finish('complete');

  const queue = new EventQueue(session, opts.signal);
  let requested = false;
  const abortTransfer = async (): Promise<void> => {
    if (!requested || !session.isConnected) return;
    requested = false;
    try {
      await session.post(Command.ABORT_HISTORICAL_TRANSMITS, Uint8Array.of(0));
    } catch (error) {
      if (!(error instanceof DisconnectedError)) throw error;
    }
  };
  const request = (): void => {
    requested = true;
    void session.send(Command.SEND_HISTORICAL_DATA, Uint8Array.of(0)).then(
      () => undefined,
      (error: unknown) => {
        if (error instanceof CommandFailedError) queue.push({ type: 'failed', error });
      },
    );
  };
  const drainUntilQuiet = async (): Promise<'quiet' | 'disconnect' | 'abort'> => {
    const until = session.clock.now() + LINK_QUIET_MAX_MS;
    for (;;) {
      const left = until - session.clock.now();
      if (left <= 0) return 'quiet';
      const event = await queue.next(Math.min(LINK_QUIET_MS, left));
      if (event.type === 'disconnect' || event.type === 'abort') return event.type;
      if (event.type === 'idle') return 'quiet';
    }
  };

  let held = opts.heldChunk ?? null;
  try {
    let reRequests = 0;
    let damagedAttempts = 0;
    let open = false;
    let chunkBaseline = 0;
    let sawFrame = false;
    let loneEnds = 0;
    let reacknowledged = false;
    let tally = emptyTally();

    const restart = async (): Promise<SyncStop | null> => {
      await abortTransfer();
      open = false;
      // Events and console lines may be spontaneous rather than history, so a re-request might not bring them back.
      tally = carryOver(tally, deviceId, ownerFloor);
      if (reRequests >= MAX_HISTORY_REREQUESTS) return 'corrupt';
      reRequests += 1;
      const drained = await drainUntilQuiet();
      if (drained !== 'quiet') return drained;
      request();
      return null;
    };

    request();
    for (;;) {
      const event = await queue.next(idleTimeoutMs);
      if (event.type === 'disconnect') return finish('disconnect');
      if (event.type === 'abort') {
        await abortTransfer();
        return finish('abort');
      }
      if (event.type === 'failed') {
        if (sawFrame) continue;
        await abortTransfer();
        throw event.error;
      }
      if (event.type === 'idle') {
        await abortTransfer();
        const firmware = session.hello?.firmware;
        const locked = !sawFrame && firmware !== undefined && isDataLockFirmware(firmware);
        return finish(locked ? 'locked' : 'idle');
      }
      sawFrame = true;
      const { packet, raw, integrity } = event;

      if (!open) {
        if (isMeta(packet, 'HISTORY_START')) {
          open = true;
          loneEnds = 0;
          chunkBaseline = integrity;
          addFrame(tally, deviceId, ownerFloor, packet, raw);
        } else if (isMeta(packet, 'HISTORY_END')) {
          const token = endTokenOf(event.packet);
          if (held !== null && token !== undefined && sameBytes(token, held.endToken)) {
            for (const frame of held.frames) addFrame(tally, deviceId, ownerFloor, frame.packet, frame.raw);
            held = null;
            try {
              await commit(tally, token);
            } catch (error) {
              await abortTransfer();
              throw error;
            }
            tally = emptyTally();
            totals.chunks += 1;
            progress();
            try {
              await session.acknowledgeHistory(token);
            } catch (error) {
              if (error instanceof DisconnectedError) return finish('disconnect');
              throw error;
            }
            // Answering a request with only the pending HISTORY_END ends that transfer, so the next chunk needs a new one.
            request();
            continue;
          }
          if (!reacknowledged && token !== undefined && lastEndToken !== null && sameBytes(token, lastEndToken)) {
            // Already committed by a sync that lost its acknowledgement, so acknowledging it trims nothing unread.
            reacknowledged = true;
            try {
              await session.acknowledgeHistory(token);
            } catch (error) {
              if (error instanceof DisconnectedError) return finish('disconnect');
              throw error;
            }
            request();
            continue;
          }
          loneEnds += 1;
          if (loneEnds >= MAX_LONE_HISTORY_ENDS) {
            await abortTransfer();
            return finish('pending');
          }
          // The head of this chunk was sent before our request opened the transfer, so acknowledging it would trim unread data.
          const stop = await restart();
          if (stop !== null) return finish(stop);
        } else if (isMeta(packet, 'HISTORY_COMPLETE')) {
          requested = false;
          if (tally.content > 0) {
            addFrame(tally, deviceId, ownerFloor, packet, raw);
            await commit(tally, null);
            progress();
          }
          return finish('complete');
        } else if (packet.kind === 'event' || packet.kind === 'console') {
          addFrame(tally, deviceId, ownerFloor, packet, raw);
        }
        continue;
      }

      if (isMeta(packet, 'HISTORY_END')) {
        if (integrity !== chunkBaseline) {
          damagedAttempts += 1;
          if (damagedAttempts >= MAX_DAMAGED_ATTEMPTS) {
            await abortTransfer();
            return finish('corrupt');
          }
          const stop = await restart();
          if (stop !== null) return finish(stop);
          continue;
        }
        addFrame(tally, deviceId, ownerFloor, packet, raw);
        const endToken = packet.endToken ?? null;
        try {
          await commit(tally, endToken);
        } catch (error) {
          await abortTransfer();
          throw error;
        }
        tally = emptyTally();
        damagedAttempts = 0;
        chunkBaseline = integrity;
        totals.chunks += 1;
        progress();
        if (endToken !== null) {
          try {
            await session.acknowledgeHistory(endToken);
          } catch (error) {
            if (error instanceof DisconnectedError) return finish('disconnect');
            throw error;
          }
        }
        continue;
      }
      if (isMeta(packet, 'HISTORY_COMPLETE')) {
        requested = false;
        if (tally.content > 0 && integrity === chunkBaseline) {
          addFrame(tally, deviceId, ownerFloor, packet, raw);
          await commit(tally, null);
          progress();
        }
        return finish('complete');
      }
      addFrame(tally, deviceId, ownerFloor, packet, raw);
    }
  } finally {
    queue.close();
  }
}
