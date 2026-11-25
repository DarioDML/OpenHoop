import { Command, isDataLockFirmware, toHex } from '@stoop/protocol';
import type { DataRange, Packet } from '@stoop/protocol';
import { sampleFromPacket } from './mapping';
import type { Session } from './session';
import { CommandFailedError, DisconnectedError } from './session';
import type { ConsoleRow, EventRow, SampleRow, Store, SyncStateRow } from './store/types';

export interface SyncProgress {
  chunks: number;
  frames: number;
  samples: number;
  discardedBeforeOwner: number;
  unknownFrames: number;
  newestSampleT: number | null;
}

export type SyncStop = 'complete' | 'disconnect' | 'abort' | 'idle' | 'locked';

export interface SyncResult {
  chunks: number;
  frames: number;
  samples: number;
  discardedBeforeOwner: number;
  unknownFrames: number;
  stoppedBy: SyncStop;
}

export interface SyncOptions {
  deviceId: number;
  onProgress?: (progress: SyncProgress) => void;
  signal?: AbortSignal;
  idleTimeoutMs?: number;
}

type SyncEvent =
  | { type: 'frame'; packet: Packet; raw: Uint8Array }
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
        if (packet.kind !== 'commandResponse' && packet.kind !== 'realtimeHr') this.push({ type: 'frame', packet, raw });
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
  frames: Uint8Array[];
  samples: SampleRow[];
  events: EventRow[];
  console: ConsoleRow[];
  unknownFrames: number;
  discarded: number;
  content: number;
}

function emptyTally(): ChunkTally {
  return { frames: [], samples: [], events: [], console: [], unknownFrames: 0, discarded: 0, content: 0 };
}

function isChunkMarker(packet: Packet): boolean {
  return packet.kind === 'metadata' && (packet.metaName === 'HISTORY_START' || packet.metaName === 'HISTORY_END');
}

function addFrame(tally: ChunkTally, deviceId: number, ownerSince: number | null, packet: Packet, raw: Uint8Array): void {
  const before = tally.frames.length;
  addFrameKind(tally, deviceId, ownerSince, packet, raw);
  if (tally.frames.length > before && !isChunkMarker(packet)) tally.content += 1;
}

function addFrameKind(tally: ChunkTally, deviceId: number, ownerSince: number | null, packet: Packet, raw: Uint8Array): void {
  switch (packet.kind) {
    case 'record': {
      if (ownerSince !== null && packet.unixS < ownerSince) {
        tally.discarded += 1;
        return;
      }
      tally.frames.push(raw);
      if (packet.record.type === 'unknown') tally.unknownFrames += 1;
      const sample = sampleFromPacket(deviceId, packet);
      if (sample !== null) tally.samples.push({ ...sample, source: 'history' });
      return;
    }
    case 'event':
      tally.frames.push(raw);
      tally.events.push({
        deviceId,
        t: packet.unixS,
        event: packet.event,
        name: packet.eventName,
        payloadHex: toHex(packet.payload),
      });
      return;
    case 'console':
      tally.frames.push(raw);
      tally.console.push({ deviceId, t: packet.unixS, sequence: packet.consoleSequence, text: packet.text });
      return;
    case 'unknown':
      tally.frames.push(raw);
      tally.unknownFrames += 1;
      return;
    default:
      tally.frames.push(raw);
  }
}

function newest(current: number | null, samples: SampleRow[]): number | null {
  let out = current;
  for (const s of samples) if (out === null || s.t > out) out = s.t;
  return out;
}

export async function syncHistory(session: Session, store: Store, opts: SyncOptions): Promise<SyncResult> {
  const { deviceId } = opts;
  const idleTimeoutMs = opts.idleTimeoutMs ?? 15_000;
  const device = await store.getDevice(deviceId);
  if (device === null) throw new Error(`device ${deviceId} is not in the store`);
  const ownerSince = device.ownerSince;
  const previous = await store.getSyncState(deviceId);
  let lastEndToken = previous?.lastEndToken ?? null;
  let newestSampleT = previous?.newestSampleT ?? null;
  let range: DataRange | null = null;

  const totals: SyncResult = {
    chunks: 0,
    frames: 0,
    samples: 0,
    discardedBeforeOwner: 0,
    unknownFrames: 0,
    stoppedBy: 'complete',
  };
  const progress = (): void =>
    opts.onProgress?.({
      chunks: totals.chunks,
      frames: totals.frames,
      samples: totals.samples,
      discardedBeforeOwner: totals.discardedBeforeOwner,
      unknownFrames: totals.unknownFrames,
      newestSampleT,
    });
  const finish = (stoppedBy: SyncStop): SyncResult => ({ ...totals, stoppedBy });

  if (opts.signal?.aborted === true) return finish('abort');

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
        frames: tally.frames,
        clockOffsetS: session.clockOffsetS(),
        receivedAt: Math.floor(session.clock.now() / 1000),
      },
      tally.samples,
      { events: tally.events, console: tally.console, unknownFrames: tally.unknownFrames, syncState: state },
    );
    newestSampleT = candidateNewest;
    if (endToken !== null) lastEndToken = endToken;
    totals.frames += tally.frames.length;
    totals.samples += tally.samples.length;
    totals.unknownFrames += tally.unknownFrames;
  };

  try {
    range = await session.dataRange();
  } catch (error) {
    if (error instanceof DisconnectedError) return finish('disconnect');
    if (!(error instanceof CommandFailedError)) throw error;
  }
  if (range?.pagesBehind === 0) return finish('complete');

  const queue = new EventQueue(session, opts.signal);
  let transferOpen = false;
  const abortTransfer = async (): Promise<void> => {
    if (!transferOpen || !session.isConnected) return;
    transferOpen = false;
    try {
      await session.post(Command.ABORT_HISTORICAL_TRANSMITS, Uint8Array.of(0));
    } catch (error) {
      if (!(error instanceof DisconnectedError)) throw error;
    }
  };

  try {
    transferOpen = true;
    void session.send(Command.SEND_HISTORICAL_DATA, Uint8Array.of(0)).then(
      () => undefined,
      (error: unknown) => {
        if (error instanceof CommandFailedError) queue.push({ type: 'failed', error });
      },
    );
    let sawFrame = false;
    let tally = emptyTally();
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
      const { packet, raw } = event;
      if (packet.kind === 'metadata' && packet.metaName === 'HISTORY_END') {
        addFrame(tally, deviceId, ownerSince, packet, raw);
        const endToken = packet.endToken ?? null;
        try {
          await commit(tally, endToken);
        } catch (error) {
          await abortTransfer();
          throw error;
        }
        tally = emptyTally();
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
      if (packet.kind === 'metadata' && packet.metaName === 'HISTORY_COMPLETE') {
        transferOpen = false;
        if (tally.content > 0) {
          addFrame(tally, deviceId, ownerSince, packet, raw);
          await commit(tally, null);
          progress();
        }
        return finish('complete');
      }
      addFrame(tally, deviceId, ownerSince, packet, raw);
    }
  } finally {
    queue.close();
  }
}
