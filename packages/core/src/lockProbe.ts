import { Command, isDataLockFirmware } from '@openhoop/protocol';
import type { FirmwareVersion, Packet } from '@openhoop/protocol';
import type { Session } from './session';
import { CommandFailedError, CommandTimeoutError, LINK_QUIET_MAX_MS, LINK_QUIET_MS } from './session';

export interface LockProbeResult {
  state: 'open' | 'locked' | 'no-data';
  firmware: FirmwareVersion;
  pagesBehind: number | null;
  sawHistory: boolean;
  sawRealtime: boolean;
  waitedMs: number;
  heldChunk: HeldChunk | null;
}

export interface HeldFrame {
  packet: Packet;
  raw: Uint8Array;
}

// A chunk the probe received whole but did not acknowledge. The band keeps it pending and answers the next
// history request with only its HISTORY_END, so the sync that follows commits these frames for that token.
export interface HeldChunk {
  frames: HeldFrame[];
  endToken: Uint8Array;
}

function holdFirstChunk(session: Session): { held: () => HeldChunk | null; stop: () => void } {
  let frames: HeldFrame[] | null = null;
  let baseline = 0;
  let held: HeldChunk | null = null;
  const stop = session.onPacket((packet, raw) => {
    if (held !== null || packet.kind === 'commandResponse' || packet.kind === 'realtimeHr') return;
    if (packet.kind === 'metadata' && packet.metaName === 'HISTORY_START') {
      frames = [{ packet, raw }];
      baseline = session.integrityErrors;
      return;
    }
    if (frames === null) return;
    frames.push({ packet, raw });
    if (packet.kind !== 'metadata' || packet.metaName !== 'HISTORY_END') return;
    const endToken = packet.endToken;
    if (endToken !== undefined && session.integrityErrors === baseline) held = { frames, endToken };
    frames = null;
  });
  return { held: () => held, stop };
}

// A sync still detects a lock on its own: no history from data-lock firmware ends it as 'locked'.
export function needsLockProbe(
  saved: LockProbeResult['state'] | 'unknown',
  firmwareBefore: string | null,
  firmwareNow: string | null,
): boolean {
  return !(saved === 'open' && firmwareBefore !== null && firmwareBefore === firmwareNow);
}

export const HISTORY_WAIT_MS = 8_000;
export const REALTIME_WAIT_MS = 6_000;
export const CHUNK_END_WAIT_MS = 10_000;

interface PacketWait {
  seen: Promise<boolean>;
  cancel: () => void;
}

function waitForPacket(session: Session, match: (packet: Packet) => boolean, timeoutMs: number): PacketWait {
  let cancel: () => void = () => undefined;
  const seen = new Promise<boolean>((resolve) => {
    const cleanups: (() => void)[] = [];
    let settled = false;
    const settle = (result: boolean): void => {
      if (settled) return;
      settled = true;
      for (const cleanup of cleanups) cleanup();
      resolve(result);
    };
    cancel = () => settle(false);
    cleanups.push(
      session.onPacket((packet) => {
        if (match(packet)) settle(true);
      }),
      session.onDisconnect(() => settle(false)),
      session.clock.schedule(timeoutMs, () => settle(false)),
    );
  });
  return { seen, cancel };
}

export function waitForQuiet(session: Session, quietMs = LINK_QUIET_MS, maxMs = LINK_QUIET_MAX_MS): Promise<void> {
  return new Promise<void>((resolve) => {
    const cleanups: (() => void)[] = [];
    let cancelQuiet: () => void = () => undefined;
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      cancelQuiet();
      for (const cleanup of cleanups) cleanup();
      resolve();
    };
    const armQuiet = (): void => {
      cancelQuiet();
      cancelQuiet = session.clock.schedule(quietMs, settle);
    };
    cleanups.push(
      session.onPacket(() => {
        if (!settled) armQuiet();
      }),
      session.onDisconnect(settle),
      session.clock.schedule(maxMs, settle),
    );
    if (!session.isConnected) settle();
    else armQuiet();
  });
}

function isHistoryData(packet: Packet): boolean {
  return packet.kind === 'record' || packet.kind === 'metadata';
}

function isChunkEnd(packet: Packet): boolean {
  return packet.kind === 'metadata' && (packet.metaName === 'HISTORY_END' || packet.metaName === 'HISTORY_COMPLETE');
}

async function tolerateNoReply(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof CommandTimeoutError || error instanceof CommandFailedError)) throw error;
  }
}

export async function probeLock(session: Session): Promise<LockProbeResult> {
  const firmware = session.hello?.firmware;
  if (firmware === undefined) throw new Error('open the session before probing the lock');
  const started = session.clock.now();
  const range = await session.dataRange();
  const pagesBehind = range.pagesBehind;
  const askedHistory = pagesBehind === null || pagesBehind > 0;
  let sawHistory = false;
  let sawRealtime = false;
  let heldChunk: HeldChunk | null = null;
  try {
    if (askedHistory) {
      const firstData = waitForPacket(session, isHistoryData, HISTORY_WAIT_MS);
      const chunkEnd = waitForPacket(session, isChunkEnd, HISTORY_WAIT_MS + CHUNK_END_WAIT_MS);
      const holder = holdFirstChunk(session);
      try {
        await session.post(Command.SEND_HISTORICAL_DATA, Uint8Array.of(0));
        sawHistory = await firstData.seen;
        // Aborting midway would leave a chunk whose head is gone; letting it end keeps every frame for the sync.
        if (sawHistory) await chunkEnd.seen;
      } finally {
        firstData.cancel();
        chunkEnd.cancel();
        holder.stop();
        heldChunk = holder.held();
      }
    } else {
      const wait = waitForPacket(session, (p) => p.kind === 'realtimeHr', REALTIME_WAIT_MS);
      await tolerateNoReply(() => session.send(Command.TOGGLE_REALTIME_HR, Uint8Array.of(1)));
      sawRealtime = await wait.seen;
      await tolerateNoReply(() => session.send(Command.TOGGLE_REALTIME_HR, Uint8Array.of(0)));
    }
  } finally {
    if (session.isConnected) {
      // The aborted chunk's tail may still be in flight; a sync started on a busy link could mistake it for its own.
      const quiet = waitForQuiet(session);
      await session.post(Command.ABORT_HISTORICAL_TRANSMITS, Uint8Array.of(0));
      await quiet;
    }
  }
  const waitedMs = session.clock.now() - started;
  // Without a backlog, silence from realtime heart rate only means the band is not worn, not that it is locked.
  const locked = askedHistory && isDataLockFirmware(firmware);
  const state = sawHistory || sawRealtime ? 'open' : locked ? 'locked' : 'no-data';
  return { state, firmware, pagesBehind, sawHistory, sawRealtime, waitedMs, heldChunk };
}
