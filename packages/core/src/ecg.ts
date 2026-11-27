import { Command, labradorGenerationBody, labradorSwitchBody, wristBody } from '@openhoop/protocol';
import type { Wrist } from '@openhoop/protocol';
import type { Session } from './session';
import { CommandFailedError, DisconnectedError } from './session';
import type { SqlDriver, SqlValue } from './store/types';

export const ECG_DURATION_MS = 30_000;
export const ECG_LAYOUT = 17;
const SUBSEC_TICKS = 32768;
const TAIL_SAMPLES = 600;
const WRITE = { confirmWrite: true } as const;

export type EcgFailure = 'unsupported' | 'no-signal';

export class EcgError extends Error {
  constructor(readonly reason: EcgFailure) {
    super(reason === 'unsupported' ? 'the band refused the ECG reading' : 'no ECG samples arrived');
    this.name = 'EcgError';
  }
}

export interface EcgCapture {
  startedAt: number;
  durationMs: number;
  samples: number[];
  rateHz: number | null;
  wrist: Wrist;
}

export interface EcgProgress {
  elapsedMs: number;
  samples: number;
  tail: readonly number[];
}

export interface RecordEcgOptions {
  wrist: Wrist;
  durationMs?: number;
  signal: AbortSignal;
  onProgress?: (progress: EcgProgress) => void;
}

interface Block {
  t: number;
  count: number;
}

export function sampleRate(blocks: readonly Block[]): number | null {
  const rates: number[] = [];
  for (let i = 0; i + 1 < blocks.length; i++) {
    const block = blocks[i];
    const next = blocks[i + 1];
    if (block === undefined || next === undefined || block.count === 0) continue;
    const span = next.t - block.t;
    if (span > 0) rates.push(block.count / span);
  }
  if (rates.length === 0) return null;
  rates.sort((a, b) => a - b);
  const mid = Math.floor(rates.length / 2);
  const median = rates.length % 2 === 1 ? (rates[mid] ?? 0) : ((rates[mid - 1] ?? 0) + (rates[mid] ?? 0)) / 2;
  return Math.round(median * 10) / 10;
}

async function sendFailing(session: Session, command: number, body: Uint8Array): Promise<void> {
  try {
    await session.send(command, body, WRITE);
  } catch (error) {
    if (error instanceof CommandFailedError) throw new EcgError('unsupported');
    throw error;
  }
}

export async function stopEcg(session: Session): Promise<void> {
  const steps: [number, Uint8Array][] = [
    [Command.TOGGLE_LABRADOR_DATA_GENERATION, labradorGenerationBody('stop')],
    [Command.TOGGLE_LABRADOR_FILTERED, labradorSwitchBody(false)],
    [Command.TOGGLE_LABRADOR_RAW_SAVE, labradorSwitchBody(false)],
  ];
  let disconnected = false;
  for (const [command, body] of steps) {
    try {
      await session.send(command, body, WRITE);
    } catch (error) {
      if (error instanceof DisconnectedError) disconnected = true;
    }
  }
  if (disconnected) throw new DisconnectedError();
}

function waitFor(ms: number, signal: AbortSignal, schedule: Session['clock']['schedule']): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = (): void => {
      cancel();
      resolve();
    };
    const cancel = schedule(ms, () => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function recordEcg(session: Session, opts: RecordEcgOptions): Promise<EcgCapture> {
  const durationMs = opts.durationMs ?? ECG_DURATION_MS;
  const samples: number[] = [];
  const blocks: Block[] = [];
  let startedMs: number | null = null;
  const off = session.onPacket((packet) => {
    if (startedMs === null || packet.kind !== 'record' || packet.layout !== ECG_LAYOUT || packet.record.type !== 'ecgFiltered') return;
    blocks.push({ t: packet.unixS + packet.subsec / SUBSEC_TICKS, count: packet.record.samples.length });
    samples.push(...packet.record.samples);
    opts.onProgress?.({ elapsedMs: session.clock.now() - startedMs, samples: samples.length, tail: samples.slice(-TAIL_SAMPLES) });
  });
  let armed = false;
  try {
    await session.post(Command.ABORT_HISTORICAL_TRANSMITS, Uint8Array.of(0));
    await session.send(Command.SELECT_WRIST, wristBody(opts.wrist), WRITE);
    armed = true;
    await sendFailing(session, Command.TOGGLE_LABRADOR_FILTERED, labradorSwitchBody(true));
    await sendFailing(session, Command.TOGGLE_LABRADOR_RAW_SAVE, labradorSwitchBody(true));
    await session.post(Command.ABORT_HISTORICAL_TRANSMITS, Uint8Array.of(0));
    startedMs = session.clock.now();
    try {
      await session.send(Command.TOGGLE_LABRADOR_DATA_GENERATION, labradorGenerationBody('start'), WRITE);
    } catch (error) {
      if (!(error instanceof CommandFailedError)) throw error;
      await sendFailing(session, Command.TOGGLE_LABRADOR_DATA_GENERATION, labradorGenerationBody('restart'));
    }
    await waitFor(durationMs, opts.signal, session.clock.schedule);
  } finally {
    off();
    if (armed && session.isConnected) await stopEcg(session).catch(() => undefined);
  }
  if (samples.length === 0 || startedMs === null) throw new EcgError('no-signal');
  return {
    startedAt: Math.floor(startedMs / 1000),
    durationMs: Math.max(0, session.clock.now() - startedMs),
    samples,
    rateHz: sampleRate(blocks),
    wrist: opts.wrist,
  };
}

export interface EcgSummary {
  id: number;
  deviceId: number;
  t: number;
  durationMs: number;
  sampleCount: number;
  rateHz: number | null;
  wrist: Wrist | null;
}

const ECG_COLUMNS = 'id, device_id, t, duration_ms, sample_count, rate_hz, wrist';

function packSamples(samples: readonly number[]): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  samples.forEach((sample, i) => view.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(sample))), true));
  return out;
}

export function unpackSamples(data: Uint8Array): number[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: number[] = [];
  for (let i = 0; i + 1 < data.byteLength; i += 2) out.push(view.getInt16(i, true));
  return out;
}

function toSummary(row: Record<string, SqlValue>): EcgSummary {
  const { id, device_id: deviceId, t, duration_ms: durationMs, sample_count: sampleCount, rate_hz: rateHz, wrist } = row;
  if (typeof id !== 'number' || typeof deviceId !== 'number' || typeof t !== 'number' || typeof durationMs !== 'number' || typeof sampleCount !== 'number') {
    throw new Error('Invalid ECG recording row in database');
  }
  return {
    id,
    deviceId,
    t,
    durationMs,
    sampleCount,
    rateHz: typeof rateHz === 'number' ? rateHz : null,
    wrist: wrist === 'left' || wrist === 'right' ? wrist : null,
  };
}

export async function insertEcgRecording(driver: SqlDriver, deviceId: number, capture: EcgCapture): Promise<number> {
  return driver.transaction(async (tx) => {
    await tx.run('INSERT INTO ecg_recordings (device_id, t, data, duration_ms, sample_count, rate_hz, wrist) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      deviceId,
      capture.startedAt,
      packSamples(capture.samples),
      capture.durationMs,
      capture.samples.length,
      capture.rateHz,
      capture.wrist,
    ]);
    const rows = await tx.all<{ id: number }>('SELECT last_insert_rowid() AS id');
    const id = rows[0]?.id;
    if (typeof id !== 'number') throw new Error('ECG recording was not stored');
    return id;
  });
}

export async function listEcgRecordings(driver: SqlDriver, deviceId: number): Promise<EcgSummary[]> {
  const rows = await driver.all<Record<string, SqlValue>>(`SELECT ${ECG_COLUMNS} FROM ecg_recordings WHERE device_id = ? ORDER BY t DESC, id DESC`, [deviceId]);
  return rows.map(toSummary);
}

export async function ecgSamples(driver: SqlDriver, id: number): Promise<number[] | null> {
  const rows = await driver.all<{ data: SqlValue }>('SELECT data FROM ecg_recordings WHERE id = ?', [id]);
  const data = rows[0]?.data;
  return data instanceof Uint8Array ? unpackSamples(data) : null;
}

export async function deleteEcgRecording(driver: SqlDriver, id: number): Promise<boolean> {
  return (await driver.run('DELETE FROM ecg_recordings WHERE id = ?', [id])).changes > 0;
}
