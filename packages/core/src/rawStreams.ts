import { Command, rawSessionBody, rawStopBody, streamSwitchBody } from '@openhoop/protocol';
import type { OpticalBlock, Packet } from '@openhoop/protocol';
import type { Axes } from './signals';
import type { Session } from './session';
import { CommandFailedError } from './session';

export type StreamKind = 'imu' | 'optical';

const LIVE_PACKET = 43;
const SUBSEC_TICKS = 32768;
const RATE_WINDOW = 5;
const WRITE = { confirmWrite: true } as const;
const SWITCH: Readonly<Record<StreamKind, number>> = { imu: Command.TOGGLE_IMU_MODE, optical: Command.TOGGLE_OPTICAL_MODE };

export class RawStreamError extends Error {
  readonly reason = 'unsupported' as const;

  constructor(readonly command: number) {
    super(`the band refused raw stream command ${command}`);
    this.name = 'RawStreamError';
  }
}

export interface LiveImuSecond {
  t: number;
  recordIndex: number;
  rateHz: number;
  accel: Axes;
  gyro: Axes;
}

export interface LiveOpticalSecond {
  t: number;
  recordIndex: number;
  rateHz: number;
  blocks: OpticalBlock[];
}

async function sendRefusable(session: Session, command: number, body: Uint8Array): Promise<void> {
  try {
    await session.send(command, body, WRITE);
  } catch (error) {
    if (error instanceof CommandFailedError) throw new RawStreamError(command);
    throw error;
  }
}

export async function switchStreams(session: Session, kinds: readonly StreamKind[], on: boolean): Promise<void> {
  for (const kind of kinds) await sendRefusable(session, SWITCH[kind], streamSwitchBody(on));
}

export async function startBandRecording(session: Session, durationMs: number): Promise<void> {
  await sendRefusable(session, Command.START_RAW_DATA, rawSessionBody(durationMs));
}

export async function stopBandRecording(session: Session): Promise<void> {
  await sendRefusable(session, Command.STOP_RAW_DATA, rawStopBody());
}

export function isLiveSignal(packet: Packet): boolean {
  return packet.kind === 'record' && packet.packetType === LIVE_PACKET && (packet.layout === 20 || packet.layout === 21);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export class StreamCollector {
  private readonly imuListeners = new Set<(s: LiveImuSecond) => void>();
  private readonly opticalListeners = new Set<(s: LiveOpticalSecond) => void>();
  private readonly counts: Record<StreamKind, number[]> = { imu: [], optical: [] };
  private readonly off: () => void;

  constructor(session: Session) {
    this.off = session.onPacket((packet) => this.take(packet));
  }

  onImu(callback: (s: LiveImuSecond) => void): () => void {
    this.imuListeners.add(callback);
    return () => this.imuListeners.delete(callback);
  }

  onOptical(callback: (s: LiveOpticalSecond) => void): () => void {
    this.opticalListeners.add(callback);
    return () => this.opticalListeners.delete(callback);
  }

  measuredRate(kind: StreamKind): number | null {
    return median(this.counts[kind]);
  }

  close(): void {
    this.off();
    this.imuListeners.clear();
    this.opticalListeners.clear();
  }

  private note(kind: StreamKind, count: number): void {
    const list = this.counts[kind];
    list.push(count);
    if (list.length > RATE_WINDOW) list.shift();
  }

  private take(packet: Packet): void {
    if (!isLiveSignal(packet) || packet.kind !== 'record') return;
    const t = packet.unixS + packet.subsec / SUBSEC_TICKS;
    const record = packet.record;
    if (record.type === 'imu') {
      this.note('imu', record.accel[0].length);
      const second: LiveImuSecond = { t, recordIndex: packet.recordIndex, rateHz: record.rateHz, accel: record.accel, gyro: record.gyro };
      for (const listener of this.imuListeners) listener(second);
    } else if (record.type === 'optical') {
      this.note('optical', record.rateHz);
      const second: LiveOpticalSecond = { t, recordIndex: packet.recordIndex, rateHz: record.rateHz, blocks: record.blocks };
      for (const listener of this.opticalListeners) listener(second);
    }
  }
}
