import { Command, isDataLockFirmware } from '@stoop/protocol';
import type { FirmwareVersion, Packet } from '@stoop/protocol';
import type { Session } from './session';
import { CommandFailedError, CommandTimeoutError } from './session';

export interface LockProbeResult {
  state: 'open' | 'locked' | 'no-data';
  firmware: FirmwareVersion;
  pagesBehind: number | null;
  sawHistory: boolean;
  sawRealtime: boolean;
  waitedMs: number;
}

export const HISTORY_WAIT_MS = 8_000;
export const REALTIME_WAIT_MS = 6_000;

function waitForPacket(session: Session, match: (packet: Packet) => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const cleanups: (() => void)[] = [];
    let settled = false;
    const settle = (seen: boolean): void => {
      if (settled) return;
      settled = true;
      for (const cleanup of cleanups) cleanup();
      resolve(seen);
    };
    cleanups.push(
      session.onPacket((packet) => {
        if (match(packet)) settle(true);
      }),
      session.onDisconnect(() => settle(false)),
      session.clock.schedule(timeoutMs, () => settle(false)),
    );
  });
}

function isHistoryData(packet: Packet): boolean {
  return packet.kind === 'record' || packet.kind === 'metadata';
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
  let sawHistory = false;
  let sawRealtime = false;
  try {
    if (pagesBehind === null || pagesBehind > 0) {
      const wait = waitForPacket(session, isHistoryData, HISTORY_WAIT_MS);
      await session.post(Command.SEND_HISTORICAL_DATA, Uint8Array.of(0));
      sawHistory = await wait;
    } else {
      const wait = waitForPacket(session, (p) => p.kind === 'realtimeHr', REALTIME_WAIT_MS);
      await tolerateNoReply(() => session.send(Command.TOGGLE_REALTIME_HR, Uint8Array.of(1)));
      sawRealtime = await wait;
      await tolerateNoReply(() => session.send(Command.TOGGLE_REALTIME_HR, Uint8Array.of(0)));
    }
  } finally {
    if (session.isConnected) await session.post(Command.ABORT_HISTORICAL_TRANSMITS, Uint8Array.of(0));
  }
  const waitedMs = session.clock.now() - started;
  const state = sawHistory || sawRealtime ? 'open' : isDataLockFirmware(firmware) ? 'locked' : 'no-data';
  return { state, firmware, pagesBehind, sawHistory, sawRealtime, waitedMs };
}
