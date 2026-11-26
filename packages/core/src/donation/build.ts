import { Zip, ZipDeflate, deflateSync, strToU8 } from 'fflate';

import type { BandModel, DeviceRow, Store } from '../store/types';
import { collectBandDayFrames, listDonationDays, type DonationBandDay } from './days';
import { REMOVAL_REASONS, emptyRemovalCounts, frameHex, knownIdentityValues, type RemovalCounts, type TimedFrame } from './frames';
import {
  DONATION_FORMAT,
  DONATION_LICENCE,
  OFFICIAL_FILES,
  readmeText,
  type DonationManifest,
  type ManifestDay,
} from './manifest';
import { PART_LIMIT_BYTES, modelLabel, modelSlug, partMargin } from './info';
import { DONATION_TABLE_FILES, donationTables, type DonationWindow } from './tables';

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;
const LINE_BATCH = 1_000;
const MAX_RETRIES = 2;
const LEVEL = 6;
const PART_FILES = ['frames.jsonl', ...DONATION_TABLE_FILES, 'MANIFEST.json', 'README.txt'];

export class DonationAbortedError extends Error {
  constructor() {
    super('The donation was cancelled');
    this.name = 'DonationAbortedError';
  }
}

export class DonationEmptyError extends Error {
  constructor() {
    super('None of the chosen days has raw band data');
    this.name = 'DonationEmptyError';
  }
}

export class DonationTooLargeError extends Error {
  constructor() {
    super('A donation part stays over the size limit');
    this.name = 'DonationTooLargeError';
  }
}

class PartOverLimit extends Error {
  constructor(readonly overBy: number) {
    super('A donation part is over the size limit');
  }
}

export interface PartSink {
  write(chunk: Uint8Array): Promise<void>;
  finish(): Promise<number>;
  discard(): Promise<void>;
}

export interface DonationProgress {
  phase: 'measure' | 'write';
  done: number;
  total: number;
}

export interface BuildDonationInput {
  store: Store;
  days: readonly string[];
  nowS: number;
  appVersion: string;
  code: string;
  openPart(fileName: string): Promise<PartSink>;
  onProgress?(progress: DonationProgress): void;
  signal?: AbortSignal;
  partLimitBytes?: number;
}

export interface DonationPart {
  fileName: string;
  bytes: number;
  model: BandModel | null;
  part: number;
  parts: number;
  days: string[];
}

export interface DonationResult {
  code: string;
  parts: DonationPart[];
  days: string[];
  skippedDays: string[];
  officialDays: string[];
  models: (BandModel | null)[];
  firmware: string[];
  removed: RemovalCounts;
  firstDay: string;
  lastDay: string;
}

export function donationCode(randomBytes: (count: number) => Uint8Array): string {
  return [...randomBytes(CODE_LENGTH)].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

export function partFileName(code: string, slug: string, bandIndex: number, part: number, parts: number): string {
  const band = bandIndex > 1 ? `-band-${bandIndex}` : '';
  return `openhoop-donation-${code}-${slug}${band}-part-${part}-of-${parts}.zip`;
}

interface MeasuredDay {
  band: DonationBandDay;
  official: boolean;
  bytes: number;
}

interface Piece {
  day: MeasuredDay;
  index: number;
  count: number;
  bytes: number;
}

interface DayCache {
  day: MeasuredDay | null;
  frames: TimedFrame[];
}

interface BandSet {
  device: DeviceRow;
  bandIndex: number;
  days: MeasuredDay[];
}

function frameLine(frame: TimedFrame): string {
  return `{"hex":"${frameHex(frame.frame)}"}\n`;
}

function planParts(days: readonly MeasuredDay[], budget: number): Piece[][] {
  const pieces: Piece[] = days.flatMap((day) => {
    const count = day.bytes > budget ? Math.ceil(day.bytes / budget) : 1;
    return Array.from({ length: count }, (_, index) => ({ day, index, count, bytes: day.bytes / count }));
  });
  const parts: Piece[][] = [];
  let current: Piece[] = [];
  let size = 0;
  for (const piece of pieces) {
    if (current.length > 0 && size + piece.bytes > budget) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(piece);
    size += piece.bytes;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

function addCounts(into: RemovalCounts, from: RemovalCounts): void {
  for (const reason of REMOVAL_REASONS) into[reason] += from[reason];
}

function isoTime(unixS: number): string {
  return new Date(unixS * 1000).toISOString().replace('.000Z', 'Z');
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export async function buildDonation(input: BuildDonationInput): Promise<DonationResult> {
  const { store, signal } = input;
  const limit = input.partLimitBytes ?? PART_LIMIT_BYTES;
  const checkAbort = (): void => {
    if (signal?.aborted === true) throw new DonationAbortedError();
  };

  const devices = await store.listDevices();
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const known = knownIdentityValues(devices);
  const wanted = new Set(input.days);
  const chosen = (await listDonationDays(store, input.nowS)).filter((d) => wanted.has(d.day)).reverse();

  const bandDays = new Map<number, MeasuredDay[]>();
  const total = chosen.reduce((n, d) => n + d.bands.length, 0);
  let measured = 0;
  const withFrames = new Set<string>();
  for (const day of chosen) {
    for (const band of day.bands) {
      checkAbort();
      const owner = deviceById.get(band.deviceId)?.ownerSince ?? null;
      const frames = await collectBandDayFrames(store, band, owner, known, emptyRemovalCounts());
      measured += 1;
      input.onProgress?.({ phase: 'measure', done: measured, total });
      if (frames.length === 0) continue;
      withFrames.add(day.day);
      const bytes = deflateSync(strToU8(frames.map(frameLine).join('')), { level: LEVEL }).length;
      const list = bandDays.get(band.deviceId) ?? [];
      list.push({ band, official: day.official, bytes });
      bandDays.set(band.deviceId, list);
    }
  }
  checkAbort();
  const resultDays = chosen.map((d) => d.day).filter((d) => withFrames.has(d));
  if (resultDays.length === 0) throw new DonationEmptyError();
  const skippedDays = unique(input.days).filter((d) => !withFrames.has(d)).sort();

  const slugCounts = new Map<string, number>();
  const sets: BandSet[] = [...bandDays.entries()]
    .sort(([a], [b]) => a - b)
    .map(([deviceId, days]) => {
      const device = deviceById.get(deviceId);
      if (device === undefined) throw new Error(`Band ${deviceId} is missing`);
      const slug = modelSlug(device.model);
      const bandIndex = (slugCounts.get(slug) ?? 0) + 1;
      slugCounts.set(slug, bandIndex);
      return { device, bandIndex, days };
    });

  let budget = limit - partMargin(limit);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (budget <= 0) break;
    const opened: PartSink[] = [];
    const removed = emptyRemovalCounts();
    try {
      const parts = await writeAll(input, sets, budget, limit, known, removed, opened, checkAbort);
      return {
        code: input.code,
        parts,
        days: resultDays,
        skippedDays,
        officialDays: chosen.filter((d) => d.official && withFrames.has(d.day)).map((d) => d.day),
        models: sets.map((s) => s.device.model),
        firmware: unique(sets.map((s) => s.device.firmware ?? 'unknown')),
        removed,
        firstDay: resultDays[0] as string,
        lastDay: resultDays[resultDays.length - 1] as string,
      };
    } catch (error) {
      await Promise.allSettled(opened.map((sink) => sink.discard()));
      if (signal?.aborted === true) throw new DonationAbortedError();
      if (!(error instanceof PartOverLimit)) throw error;
      budget -= error.overBy + partMargin(limit);
    }
  }
  throw new DonationTooLargeError();
}

async function writeAll(
  input: BuildDonationInput,
  sets: readonly BandSet[],
  budget: number,
  limit: number,
  known: readonly string[],
  removed: RemovalCounts,
  opened: PartSink[],
  checkAbort: () => void,
): Promise<DonationPart[]> {
  const plans = sets.map((set) => ({ set, parts: planParts(set.days, budget) }));
  const totalPieces = plans.reduce((n, p) => n + p.parts.reduce((m, part) => m + part.length, 0), 0);
  const progress = { done: 0, total: totalPieces };
  const cache: DayCache = { day: null, frames: [] };
  const out: DonationPart[] = [];
  for (const { set, parts } of plans) {
    for (let i = 0; i < parts.length; i += 1) {
      const pieces = parts[i] as Piece[];
      const part = await writePart(input, set, pieces, i + 1, parts.length, known, removed, opened, checkAbort, progress, cache);
      if (part.bytes > limit) throw new PartOverLimit(part.bytes - limit);
      out.push(part);
    }
  }
  return out;
}

async function writePart(
  input: BuildDonationInput,
  set: BandSet,
  pieces: readonly Piece[],
  partNo: number,
  parts: number,
  known: readonly string[],
  removed: RemovalCounts,
  opened: PartSink[],
  checkAbort: () => void,
  progress: { done: number; total: number },
  cache: DayCache,
): Promise<DonationPart> {
  checkAbort();
  const { device } = set;
  const fileName = partFileName(input.code, modelSlug(device.model), set.bandIndex, partNo, parts);
  const sink = await input.openPart(fileName);
  opened.push(sink);

  const queue: Uint8Array[] = [];
  let zipError: Error | null = null;
  const zip = new Zip((error, data) => {
    if (error !== null) zipError = error;
    else queue.push(data);
  });
  const drain = async (): Promise<void> => {
    if (zipError !== null) throw zipError;
    for (let chunk = queue.shift(); chunk !== undefined; chunk = queue.shift()) await sink.write(chunk);
  };
  const addText = async (name: string, text: string): Promise<void> => {
    const entry = new ZipDeflate(name, { level: LEVEL });
    zip.add(entry);
    entry.push(strToU8(text), true);
    await drain();
  };

  const framesEntry = new ZipDeflate('frames.jsonl', { level: LEVEL });
  zip.add(framesEntry);
  const partRemoved = emptyRemovalCounts();
  const frameTypes: Record<string, number> = {};
  let frameCount = 0;
  let first: number | null = null;
  let last: number | null = null;
  for (const piece of pieces) {
    checkAbort();
    if (cache.day !== piece.day) {
      cache.frames = await collectBandDayFrames(input.store, piece.day.band, device.ownerSince, known, partRemoved);
      cache.day = piece.day;
    }
    const all = cache.frames;
    const from = Math.floor((piece.index * all.length) / piece.count);
    const to = Math.floor(((piece.index + 1) * all.length) / piece.count);
    const frames = all.slice(from, to);
    for (let offset = 0; offset < frames.length; offset += LINE_BATCH) {
      checkAbort();
      const batch = frames.slice(offset, offset + LINE_BATCH);
      for (const frame of batch) {
        const type = String(frame.frame[8] ?? 0);
        frameTypes[type] = (frameTypes[type] ?? 0) + 1;
        first = first === null ? frame.t : Math.min(first, frame.t);
        last = last === null ? frame.t : Math.max(last, frame.t);
      }
      frameCount += batch.length;
      framesEntry.push(strToU8(batch.map(frameLine).join('')));
      await drain();
    }
    progress.done += 1;
    input.onProgress?.({ phase: 'write', done: progress.done, total: progress.total });
  }
  framesEntry.push(new Uint8Array(0), true);
  await drain();
  addCounts(removed, partRemoved);

  const windowsByDay = new Map<string, DonationWindow>();
  const manifestDays: ManifestDay[] = [];
  for (const piece of pieces) {
    const { band } = piece.day;
    windowsByDay.set(band.day, { day: band.day, start: band.start, end: band.end });
    const entry: ManifestDay = { day: band.day, start: band.start, end: band.end, tz_offset_s: band.tzOffsetS, official: piece.day.official };
    if (piece.count > 1) entry.piece = { index: piece.index + 1, count: piece.count };
    manifestDays.push(entry);
  }
  const tables = await donationTables(input.store.driver, device.id, [...windowsByDay.values()]);
  for (const file of DONATION_TABLE_FILES) await addText(file, tables[file]);

  const manifest: DonationManifest = {
    format: DONATION_FORMAT,
    tool: `OpenHoop ${input.appVersion}`,
    donation_code: input.code,
    part: partNo,
    parts,
    band_model: modelLabel(device.model),
    firmware: device.firmware ?? 'unknown',
    licence: DONATION_LICENCE,
    frames: frameCount,
    frame_types: frameTypes,
    record_time_span_utc: first === null || last === null ? null : [isoTime(first), isoTime(last)],
    days: manifestDays,
    whoop_export_files: [...OFFICIAL_FILES],
    files: PART_FILES,
    removed: partRemoved,
  };
  await addText('MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  await addText('README.txt', readmeText(manifest));
  zip.end();
  await drain();
  const bytes = await sink.finish();
  return { fileName, bytes, model: device.model, part: partNo, parts, days: unique(pieces.map((p) => p.day.band.day)) };
}
