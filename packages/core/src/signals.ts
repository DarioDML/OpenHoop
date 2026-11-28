import type { Packet } from '@openhoop/protocol';
import { bulkInsert } from './store/bulk';
import type { SqlDriver, SqlValue } from './store/types';

export type Axes = [number[], number[], number[]];

export interface ImuSecond {
  deviceId: number;
  t: number;
  rateHz: number;
  accel: Axes;
  gyro: Axes;
}

export interface StoredOpticalBlock {
  sourceA: number;
  driveA: number;
  detectorA: number;
  sourceB: number;
  driveB: number;
  detectorB: number;
  slotA: number[];
  slotB: number[];
}

export interface OpticalSecond {
  deviceId: number;
  t: number;
  layout: 20 | 26;
  rateHz: number;
  blocks: StoredOpticalBlock[];
}

export interface SignalRows {
  imu: ImuSecond[];
  optical: OpticalSecond[];
}

export function emptySignals(): SignalRows {
  return { imu: [], optical: [] };
}

const PACK_VERSION = 1;
const IMU_HEADER = 6;
const OPTICAL_HEADER = 4;
const BLOCK_HEADER = 12;
const R26_RATE_HZ = 25;

export class SignalFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignalFormatError';
  }
}

function axisLength(axes: Axes): number {
  const n = axes[0].length;
  if (axes[1].length !== n || axes[2].length !== n) throw new SignalFormatError('axes differ in length');
  return n;
}

export function packImu(s: ImuSecond): Uint8Array {
  const na = axisLength(s.accel);
  const ng = axisLength(s.gyro);
  const out = new Uint8Array(IMU_HEADER + 6 * na + 6 * ng);
  const view = new DataView(out.buffer);
  out[0] = PACK_VERSION;
  out[1] = s.rateHz;
  view.setUint16(2, na, true);
  view.setUint16(4, ng, true);
  let at = IMU_HEADER;
  for (const axis of [...s.accel, ...s.gyro]) {
    for (const v of axis) {
      view.setInt16(at, v, true);
      at += 2;
    }
  }
  return out;
}

function readAxes(view: DataView, at: number, n: number): Axes {
  const axes: Axes = [[], [], []];
  for (let a = 0; a < 3; a++) for (let k = 0; k < n; k++) axes[a]?.push(view.getInt16(at + 2 * (a * n + k), true));
  return axes;
}

export function unpackImu(deviceId: number, t: number, data: Uint8Array): ImuSecond {
  if (data.length < IMU_HEADER || data[0] !== PACK_VERSION) throw new SignalFormatError('unknown motion format');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const na = view.getUint16(2, true);
  const ng = view.getUint16(4, true);
  if (data.length !== IMU_HEADER + 6 * na + 6 * ng) throw new SignalFormatError('motion length mismatch');
  return { deviceId, t, rateHz: data[1] ?? 0, accel: readAxes(view, IMU_HEADER, na), gyro: readAxes(view, IMU_HEADER + 6 * na, ng) };
}

export function packOptical(s: OpticalSecond): Uint8Array {
  const size = s.blocks.reduce((sum, b) => sum + BLOCK_HEADER + 4 * (b.slotA.length + b.slotB.length), OPTICAL_HEADER);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out[0] = PACK_VERSION;
  out[1] = s.layout;
  out[2] = s.rateHz;
  out[3] = s.blocks.length;
  let at = OPTICAL_HEADER;
  for (const b of s.blocks) {
    view.setUint8(at, b.sourceA);
    view.setUint16(at + 1, b.driveA, true);
    view.setUint8(at + 3, b.detectorA);
    view.setUint8(at + 4, b.sourceB);
    view.setUint16(at + 5, b.driveB, true);
    view.setUint8(at + 7, b.detectorB);
    view.setUint16(at + 8, b.slotA.length, true);
    view.setUint16(at + 10, b.slotB.length, true);
    at += BLOCK_HEADER;
    for (const v of [...b.slotA, ...b.slotB]) {
      view.setInt32(at, v, true);
      at += 4;
    }
  }
  return out;
}

function readSlot(view: DataView, at: number, n: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(view.getInt32(at + 4 * k, true));
  return out;
}

export function unpackOptical(deviceId: number, t: number, data: Uint8Array): OpticalSecond {
  if (data.length < OPTICAL_HEADER || data[0] !== PACK_VERSION) throw new SignalFormatError('unknown optical format');
  const layout = data[1];
  if (layout !== 20 && layout !== 26) throw new SignalFormatError(`unknown optical layout ${String(layout)}`);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const blocks: StoredOpticalBlock[] = [];
  let at = OPTICAL_HEADER;
  for (let n = 0; n < (data[3] ?? 0); n++) {
    if (at + BLOCK_HEADER > data.length) throw new SignalFormatError('optical block header cut short');
    const countA = view.getUint16(at + 8, true);
    const countB = view.getUint16(at + 10, true);
    const samplesAt = at + BLOCK_HEADER;
    if (samplesAt + 4 * (countA + countB) > data.length) throw new SignalFormatError('optical samples cut short');
    blocks.push({
      sourceA: view.getUint8(at),
      driveA: view.getUint16(at + 1, true),
      detectorA: view.getUint8(at + 3),
      sourceB: view.getUint8(at + 4),
      driveB: view.getUint16(at + 5, true),
      detectorB: view.getUint8(at + 7),
      slotA: readSlot(view, samplesAt, countA),
      slotB: readSlot(view, samplesAt + 4 * countA, countB),
    });
    at = samplesAt + 4 * (countA + countB);
  }
  return { deviceId, t, layout, rateHz: data[2] ?? 0, blocks };
}

export function signalsFromPacket(deviceId: number, packet: Packet): SignalRows {
  const rows = emptySignals();
  if (packet.kind !== 'record') return rows;
  const record = packet.record;
  const t = packet.unixS;
  if (record.type === 'imu') {
    rows.imu.push({ deviceId, t, rateHz: record.rateHz, accel: record.accel, gyro: record.gyro });
  } else if (record.type === 'optical') {
    rows.optical.push({
      deviceId,
      t,
      layout: 20,
      rateHz: record.rateHz,
      blocks: record.blocks.map((b) => ({
        sourceA: b.sourceA,
        driveA: b.driveA,
        detectorA: b.detectorA,
        sourceB: b.sourceB,
        driveB: b.driveB,
        detectorB: b.detectorB,
        slotA: b.slotA,
        slotB: b.slotB,
      })),
    });
  } else if (record.type === 'compactOptical') {
    rows.optical.push({
      deviceId,
      t,
      layout: 26,
      rateHz: R26_RATE_HZ,
      blocks: [{ sourceA: 0, driveA: 0, detectorA: 0, sourceB: 0, driveB: 0, detectorB: 0, slotA: record.samples, slotB: [] }],
    });
  }
  return rows;
}

export function mergeSignals(into: SignalRows, more: SignalRows): void {
  into.imu.push(...more.imu);
  into.optical.push(...more.optical);
}

export function signalRangeOf(rows: SignalRows): { from: number; to: number } | null {
  const times = [...rows.imu.map((r) => r.t), ...rows.optical.map((r) => r.t)];
  if (times.length === 0) return null;
  return { from: Math.min(...times), to: Math.max(...times) };
}

export async function insertSignals(driver: SqlDriver, rows: SignalRows, chunkId: number | null): Promise<number> {
  const imu = await bulkInsert(
    driver,
    'INSERT OR IGNORE INTO imu_blocks (device_id, t, data, chunk_id)',
    4,
    rows.imu.map((s): SqlValue[] => [s.deviceId, s.t, packImu(s), chunkId]),
  );
  const optical = await bulkInsert(
    driver,
    'INSERT OR IGNORE INTO optical_bursts (device_id, t, layout, data, chunk_id)',
    5,
    rows.optical.map((s): SqlValue[] => [s.deviceId, s.t, s.layout, packOptical(s), chunkId]),
  );
  return imu + optical;
}

function blobOf(value: SqlValue | undefined): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new SignalFormatError('signal row has no data');
  return value;
}

function numberOf(value: SqlValue | undefined): number {
  if (typeof value !== 'number') throw new SignalFormatError('signal row has no time');
  return value;
}

export async function imuBetween(driver: SqlDriver, deviceId: number, from: number, to: number): Promise<ImuSecond[]> {
  const rows = await driver.all('SELECT t, data FROM imu_blocks WHERE device_id = ? AND t BETWEEN ? AND ? ORDER BY t', [deviceId, from, to]);
  return rows.map((row) => unpackImu(deviceId, numberOf(row.t), blobOf(row.data)));
}

export async function opticalBetween(driver: SqlDriver, deviceId: number, from: number, to: number): Promise<OpticalSecond[]> {
  const rows = await driver.all('SELECT t, data FROM optical_bursts WHERE device_id = ? AND t BETWEEN ? AND ? ORDER BY t, layout', [deviceId, from, to]);
  return rows.map((row) => unpackOptical(deviceId, numberOf(row.t), blobOf(row.data)));
}

export async function pruneSignalsBefore(driver: SqlDriver, deviceId: number, t: number): Promise<number> {
  const imu = await driver.run('DELETE FROM imu_blocks WHERE device_id = ? AND t < ?', [deviceId, t]);
  const optical = await driver.run('DELETE FROM optical_bursts WHERE device_id = ? AND t < ?', [deviceId, t]);
  return imu.changes + optical.changes;
}
