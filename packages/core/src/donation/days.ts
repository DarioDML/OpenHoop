import { ChunkIntegrityError } from '../store/chunkCodec';
import type { BandModel, SqlDriver, Store } from '../store/types';
import { emptyRemovalCounts, frameHex, identityReason, timeChunkFrames, type DayFrame, type RemovalCounts } from './frames';

const CRC_BYTES = 4;

function duplicateKey(frame: Uint8Array, t: number): string {
  return `${t}:${frame.length}:${frameHex(frame.subarray(frame.length - CRC_BYTES))}`;
}

const ALL_FROM = '0000-01-01';
const ALL_TO = '9999-12-31';
const OPEN_CYCLE_S = 86_400;

export interface DonationBandDay {
  deviceId: number;
  model: BandModel | null;
  day: string;
  start: number;
  end: number;
  tzOffsetS: number;
  frameEstimate: number;
}

export interface DonationDay {
  day: string;
  asleepS: number | null;
  official: boolean;
  bands: DonationBandDay[];
}

async function countFrames(driver: SqlDriver, deviceId: number, from: number, to: number): Promise<number> {
  const rows = await driver.all<{ n: number }>(
    `SELECT
       (SELECT COUNT(*) FROM samples_1hz WHERE device_id = ? AND t >= ? AND t < ? AND chunk_id IS NOT NULL) +
       (SELECT COUNT(*) FROM events WHERE device_id = ? AND t >= ? AND t < ? AND chunk_id IS NOT NULL) AS n`,
    [deviceId, from, to, deviceId, from, to],
  );
  return rows[0]?.n ?? 0;
}

async function hasOfficialValues(driver: SqlDriver, start: number, end: number): Promise<boolean> {
  const rows = await driver.all<{ found: number }>(
    `SELECT
       EXISTS (SELECT 1 FROM vendor_cycles WHERE start_t < ? AND COALESCE(end_t, start_t + ${OPEN_CYCLE_S}) > ?) OR
       EXISTS (SELECT 1 FROM vendor_sleeps WHERE onset < ? AND wake > ?) AS found`,
    [end, start, end, start],
  );
  return (rows[0]?.found ?? 0) === 1;
}

interface DayEntry {
  bands: DonationBandDay[];
  official: boolean;
  asleepS: number | null;
  mostFrames: number;
}

export async function listDonationDays(store: Store, nowS: number): Promise<DonationDay[]> {
  const days = new Map<string, DayEntry>();
  for (const device of await store.listDevices()) {
    for (const record of await store.listDays(device.id, ALL_FROM, ALL_TO)) {
      if (record.end > nowS) continue;
      const lower = Math.max(record.start, device.ownerSince ?? record.start);
      if (lower >= record.end) continue;
      const frameEstimate = await countFrames(store.driver, device.id, lower, record.end);
      if (frameEstimate === 0) continue;
      const band: DonationBandDay = {
        deviceId: device.id,
        model: device.model,
        day: record.day,
        start: record.start,
        end: record.end,
        tzOffsetS: record.tzOffsetS,
        frameEstimate,
      };
      const official = await hasOfficialValues(store.driver, record.start, record.end);
      const entry = days.get(record.day);
      if (entry === undefined) {
        days.set(record.day, { bands: [band], official, asleepS: record.sleep.asleepS, mostFrames: frameEstimate });
        continue;
      }
      entry.bands.push(band);
      entry.official ||= official;
      if (frameEstimate > entry.mostFrames) {
        entry.mostFrames = frameEstimate;
        entry.asleepS = record.sleep.asleepS;
      }
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, entry]) => ({
      day,
      asleepS: entry.asleepS,
      official: entry.official,
      bands: [...entry.bands].sort((x, y) => x.deviceId - y.deviceId),
    }));
}

async function chunkIdsIn(driver: SqlDriver, band: DonationBandDay): Promise<number[]> {
  const rows = await driver.all<{ chunk_id: number }>(
    `SELECT chunk_id FROM samples_1hz WHERE device_id = ? AND t >= ? AND t < ? AND chunk_id IS NOT NULL
     UNION
     SELECT chunk_id FROM events WHERE device_id = ? AND t >= ? AND t < ? AND chunk_id IS NOT NULL
     ORDER BY 1`,
    [band.deviceId, band.start, band.end, band.deviceId, band.start, band.end],
  );
  return rows.map((row) => row.chunk_id);
}

export async function collectBandDayFrames(
  store: Store,
  band: DonationBandDay,
  ownerSince: number | null,
  known: readonly string[],
  removed: RemovalCounts,
): Promise<DayFrame[]> {
  const seen = new Set<string>();
  const kept: DayFrame[] = [];
  for (const chunkId of await chunkIdsIn(store.driver, band)) {
    let frames: Uint8Array[];
    try {
      frames = await store.readChunkFrames(chunkId);
    } catch (error) {
      if (!(error instanceof ChunkIntegrityError)) throw error;
      removed.corruptChunk += 1;
      continue;
    }
    const chunkCounts = emptyRemovalCounts();
    const timed = timeChunkFrames(frames, chunkCounts);
    const anchor = timed[0]?.t;
    if (anchor !== undefined && anchor >= band.start && anchor < band.end) {
      removed.invalid += chunkCounts.invalid;
      removed.untimed += chunkCounts.untimed;
    }
    for (const entry of timed) {
      if (entry.t < band.start || entry.t >= band.end) continue;
      if (ownerSince !== null && entry.t < ownerSince) {
        removed.beforeOwner += 1;
        continue;
      }
      const reason = identityReason(entry.frame, entry.packet, known);
      if (reason !== null) {
        removed[reason] += 1;
        continue;
      }
      const key = duplicateKey(entry.frame, entry.t);
      if (seen.has(key)) {
        removed.duplicate += 1;
        continue;
      }
      seen.add(key);
      kept.push({ frame: entry.frame, t: entry.t });
    }
  }
  return kept.sort((x, y) => x.t - y.t);
}
