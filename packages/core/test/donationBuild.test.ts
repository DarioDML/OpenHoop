import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Profile } from '@openhoop/analytics';
import { encodeConsole, encodeEvent } from '@openhoop/protocol';
import { deflateSync, strFromU8, strToU8, unzipSync } from 'fflate';
import {
  DONATION_TABLE_FILES,
  DonationAbortedError,
  DonationEmptyError,
  ESTIMATED_ZIPPED_BYTES_PER_FRAME,
  PART_LIMIT_BYTES,
  buildDonation,
  donationCode,
  estimateDonation,
  frameHex,
  listDonationDays,
  openStore,
  recomputeDays,
} from '../src/index';
import type { BuildDonationInput, DeviceRow, DonationDay, DonationResult, EventRow, PartSink, SampleRow, Store, SyncStateRow } from '../src/index';
import { openStrictDriver } from './strictDriver';
import { TZ_S, decodeRow, simulateDays, toFrame } from './sampleFactory';

const HOUR_S = 3_600;
const PROFILE: Profile = { maxHr: 190, birthYear: null, restingHr: null };
const CODE = 'k3f9x2ab';
const FAR_FUTURE = 4_000_000_000;

function device(overrides: Partial<Omit<DeviceRow, 'id'>> = {}): Omit<DeviceRow, 'id'> {
  return { bleId: 'AA:01', name: 'WHOOP 5', model: '5.0', firmware: '50.43.2.0', serial: 'SN1', ownerSince: null, configSnapshot: null, ...overrides };
}

function syncState(deviceId: number): SyncStateRow {
  return { deviceId, lastEndToken: null, lastSyncAt: 1, newestSampleT: null, readPage: null, writePage: null, trimPage: null, totalPages: null };
}

async function seedBand(store: Store, row: Omit<DeviceRow, 'id'>): Promise<number> {
  const deviceId = (await store.upsertDevice(row)).id;
  const rows = simulateDays(deviceId, { days: 2 });
  for (let from = 0; from < rows.length; from += 4 * HOUR_S) {
    const frames = rows.slice(from, from + 4 * HOUR_S).map((r, i) => toFrame(r, from + i));
    const samples = frames.map((f) => decodeRow(deviceId, f)).filter((r): r is SampleRow => r !== null);
    await store.commitChunk({ deviceId, endToken: null, frames, clockOffsetS: 0, receivedAt: 1 }, samples, {
      events: [],
      console: [],
      unknownFrames: 0,
      syncState: syncState(deviceId),
    });
  }
  const first = rows[0] as SampleRow;
  const last = rows[rows.length - 1] as SampleRow;
  await recomputeDays(store, { deviceId, from: first.t, to: last.t + 1, profile: PROFILE, tzOffsetS: TZ_S });
  return deviceId;
}

async function addFramesAt(store: Store, deviceId: number, frames: Uint8Array[], t: number): Promise<void> {
  const event: EventRow = { deviceId, t, event: 3, name: 'BATTERY_LEVEL', payloadHex: '' };
  await store.commitChunk({ deviceId, endToken: null, frames: [...frames, encodeEvent({ event: 3, unixS: t })], clockOffsetS: 0, receivedAt: 1 }, [], {
    events: [event],
    console: [],
    unknownFrames: 0,
    syncState: syncState(deviceId),
  });
}

interface Sinks {
  openPart: BuildDonationInput['openPart'];
  opened: string[];
  discarded: string[];
  bytes(name: string): Uint8Array;
}

function memorySinks(opts: { failWriteInPart?: number; overLimitOnce?: number; abortOnFinish?: AbortController } = {}): Sinks {
  const stored = new Map<string, Uint8Array[]>();
  const opened: string[] = [];
  const discarded: string[] = [];
  let reportedOver = false;
  return {
    opened,
    discarded,
    bytes(name) {
      const chunks = stored.get(name) ?? [];
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out;
    },
    async openPart(name): Promise<PartSink> {
      opened.push(name);
      const chunks: Uint8Array[] = [];
      stored.set(name, chunks);
      const index = opened.length;
      return {
        async write(chunk) {
          if (opts.failWriteInPart === index) throw new Error('disk full');
          chunks.push(chunk.slice());
        },
        async finish() {
          opts.abortOnFinish?.abort();
          const size = chunks.reduce((n, c) => n + c.length, 0);
          if (opts.overLimitOnce !== undefined && !reportedOver) {
            reportedOver = true;
            return opts.overLimitOnce + 1;
          }
          return size;
        },
        async discard() {
          discarded.push(name);
        },
      };
    },
  };
}

function entriesOf(sinks: Sinks, name: string): Record<string, Uint8Array> {
  return unzipSync(sinks.bytes(name));
}

function manifestOf(sinks: Sinks, name: string): Record<string, unknown> {
  const raw = entriesOf(sinks, name)['MANIFEST.json'];
  if (raw === undefined) throw new Error('no manifest');
  return JSON.parse(strFromU8(raw)) as Record<string, unknown>;
}

function framesText(sinks: Sinks, result: DonationResult): string {
  return result.parts.map((p) => strFromU8(entriesOf(sinks, p.fileName)['frames.jsonl'] ?? new Uint8Array(0))).join('');
}

describe('buildDonation', () => {
  let store: Store;
  let days: string[];

  function input(overrides: Partial<BuildDonationInput> & { sinks: Sinks }): BuildDonationInput {
    const { sinks, ...rest } = overrides;
    return { store, days, nowS: FAR_FUTURE, appVersion: '1.4.0', code: CODE, openPart: sinks.openPart, ...rest };
  }

  beforeAll(async () => {
    store = await openStore(openStrictDriver());
    await seedBand(store, device());
    days = (await listDonationDays(store, FAR_FUTURE)).map((d) => d.day).reverse();
  });
  afterAll(async () => {
    await store.driver.close();
  });

  it('writes one part with frames, tables, manifest and readme', async () => {
    const sinks = memorySinks();
    const result = await buildDonation(input({ sinks }));
    expect(result.parts.map((p) => p.fileName)).toEqual([`openhoop-donation-${CODE}-5.0-part-1-of-1.zip`]);
    const name = `openhoop-donation-${CODE}-5.0-part-1-of-1.zip`;
    const entries = entriesOf(sinks, name);
    expect(Object.keys(entries).sort()).toEqual(['MANIFEST.json', 'README.txt', 'frames.jsonl', ...DONATION_TABLE_FILES].sort());
    const lines = strFromU8(entries['frames.jsonl'] ?? new Uint8Array(0)).trim().split('\n');
    for (const line of lines) expect(line).toMatch(/^\{"hex":"[0-9a-f]+"\}$/);
    const manifest = manifestOf(sinks, name);
    expect(manifest).toMatchObject({
      format: 'openhoop-donation/1',
      tool: 'OpenHoop 1.4.0',
      donation_code: CODE,
      part: 1,
      parts: 1,
      band_model: '5.0',
      firmware: '50.43.2.0',
      licence: 'CC0-1.0',
      frames: lines.length,
      whoop_export_files: ['official/cycles.csv', 'official/sleeps.csv', 'official/workouts.csv'],
    });
    expect((manifest.days as { day: string }[]).map((d) => d.day)).toEqual(days);
    expect(strFromU8(entries['README.txt'] ?? new Uint8Array(0))).toContain('CC0 1.0');
    expect(result).toMatchObject({ code: CODE, days, skippedDays: [], models: ['5.0'], firstDay: days[0], lastDay: days[days.length - 1] });
    expect(sinks.discarded).toEqual([]);
  });

  it('splits days over several parts under the limit and keeps every frame once', async () => {
    const whole = memorySinks();
    const single = await buildDonation(input({ sinks: whole }));
    const sinks = memorySinks();
    const limit = 1_200_000;
    const result = await buildDonation(input({ sinks, partLimitBytes: limit }));
    expect(result.parts.length).toBeGreaterThan(1);
    for (const part of result.parts) {
      expect(part.bytes).toBeLessThanOrEqual(limit);
      expect(part.fileName).toBe(`openhoop-donation-${CODE}-5.0-part-${part.part}-of-${result.parts.length}.zip`);
      expect(manifestOf(sinks, part.fileName)).toMatchObject({ donation_code: CODE, part: part.part, parts: result.parts.length });
    }
    expect(framesText(sinks, result)).toBe(framesText(whole, single));
  });

  it('splits a day larger than the limit by time and marks the pieces', async () => {
    const sinks = memorySinks();
    const oneDay = days.slice(0, 1);
    const result = await buildDonation(input({ sinks, days: oneDay, partLimitBytes: 600_000 }));
    expect(result.parts.length).toBeGreaterThan(1);
    const pieces = result.parts.map((p) => (manifestOf(sinks, p.fileName).days as { piece?: { index: number; count: number } }[])[0]?.piece);
    expect(pieces).toEqual(result.parts.map((_, i) => ({ index: i + 1, count: result.parts.length })));
  });

  it('reports days that lost their frames and refuses an empty donation', async () => {
    await expect(buildDonation(input({ sinks: memorySinks(), days: ['2000-01-01'] }))).rejects.toBeInstanceOf(DonationEmptyError);
    const result = await buildDonation(input({ sinks: memorySinks(), days: [days[0] as string, '2000-01-01'] }));
    expect(result.skippedDays).toEqual(['2000-01-01']);
    expect(result.days).toEqual([days[0]]);
  });

  it('discards every part when cancelled', async () => {
    const sinks = memorySinks();
    const controller = new AbortController();
    const run = buildDonation(
      input({ sinks, partLimitBytes: 1_200_000, signal: controller.signal, onProgress: (p) => (p.phase === 'write' ? controller.abort() : undefined) }),
    );
    await expect(run).rejects.toBeInstanceOf(DonationAbortedError);
    expect(sinks.opened.length).toBeGreaterThan(0);
    expect([...sinks.discarded].sort()).toEqual([...sinks.opened].sort());
  });

  it('discards the parts when cancelled while the last part is being finished', async () => {
    const controller = new AbortController();
    const sinks = memorySinks({ abortOnFinish: controller });
    await expect(buildDonation(input({ sinks, signal: controller.signal }))).rejects.toBeInstanceOf(DonationAbortedError);
    expect(sinks.opened).toHaveLength(1);
    expect(sinks.discarded).toEqual(sinks.opened);
  });

  it('responds to a cancel that arrives while a day is being measured', async () => {
    const controller = new AbortController();
    const sinks = memorySinks();
    setTimeout(() => controller.abort(), 0);
    await expect(buildDonation(input({ sinks, signal: controller.signal }))).rejects.toBeInstanceOf(DonationAbortedError);
    expect(sinks.opened).toEqual([]);
  });

  it('discards written parts when a write fails', async () => {
    const sinks = memorySinks({ failWriteInPart: 2 });
    await expect(buildDonation(input({ sinks, partLimitBytes: 1_200_000 }))).rejects.toThrow('disk full');
    expect(sinks.opened).toHaveLength(2);
    expect([...sinks.discarded].sort()).toEqual([...sinks.opened].sort());
  });

  it('rebuilds with a smaller budget when a part comes out over the limit', async () => {
    const limit = 1_200_000;
    const plain = await buildDonation(input({ sinks: memorySinks(), partLimitBytes: limit }));
    const sinks = memorySinks({ overLimitOnce: limit });
    const result = await buildDonation(input({ sinks, partLimitBytes: limit }));
    expect(sinks.discarded.length).toBeGreaterThan(0);
    expect(result.parts.length).toBeGreaterThanOrEqual(plain.parts.length);
    for (const part of result.parts) expect(part.bytes).toBeLessThanOrEqual(limit);
  });
});

describe('buildDonation with other bands', () => {
  it('makes a separate set of parts per band', async () => {
    const store = await openStore(openStrictDriver());
    await seedBand(store, device({ bleId: 'AA:01' }));
    await seedBand(store, device({ bleId: 'BB:02' }));
    const days = (await listDonationDays(store, FAR_FUTURE)).map((d) => d.day);
    const result = await buildDonation({ store, days, nowS: FAR_FUTURE, appVersion: '1.4.0', code: CODE, openPart: memorySinks().openPart });
    expect(result.parts.map((p) => p.fileName)).toEqual([
      `openhoop-donation-${CODE}-5.0-part-1-of-1.zip`,
      `openhoop-donation-${CODE}-5.0-band-2-part-1-of-1.zip`,
    ]);
    await store.driver.close();
  });

  it('never writes the serial, the address or the band name, in text or in hex', async () => {
    const store = await openStore(openStrictDriver());
    const secrets = { serial: '5AG1234567', name: 'MyBand42', bleId: 'AA:BB:CC:DD:EE:FF' };
    const deviceId = await seedBand(store, device(secrets));
    const listed = await listDonationDays(store, FAR_FUTURE);
    const band = listed[0]?.bands[0];
    if (band === undefined) throw new Error('needs a day');
    await addFramesAt(
      store,
      deviceId,
      [
        encodeConsole({ consoleSequence: 1, unixS: band.start + 10, text: `serial ${secrets.serial}` }),
        encodeConsole({ consoleSequence: 2, unixS: band.start + 11, text: `name ${secrets.name}` }),
        encodeConsole({ consoleSequence: 3, unixS: band.start + 12, text: `mac ${secrets.bleId}` }),
      ],
      band.start + 13,
    );
    const sinks = memorySinks();
    const result = await buildDonation({ store, days: listed.map((d) => d.day), nowS: FAR_FUTURE, appVersion: '1.4.0', code: CODE, openPart: sinks.openPart });
    const text = result.parts
      .flatMap((p) => Object.values(entriesOf(sinks, p.fileName)))
      .map((bytes) => strFromU8(bytes))
      .join('\n');
    for (const value of Object.values(secrets)) {
      expect(text).not.toContain(value);
      expect(text).not.toContain(frameHex(strToU8(value)));
    }
    expect(result.removed.serialText + result.removed.knownText + result.removed.addressText).toBe(3);
    await store.driver.close();
  });

  it('never writes a fragment of a band log line that names an identity, and counts it in the manifest', async () => {
    const store = await openStore(openStrictDriver());
    const deviceId = await seedBand(store, device({ model: 'MG', name: 'WHOOP ROBIN', bleId: '02:1A:2B:3C:4D:5E' }));
    const listed = await listDonationDays(store, FAR_FUTURE);
    const band = listed[0]?.bands[0];
    if (band === undefined) throw new Error('needs a day');
    const texts = [
      '\n 30, 2372293640: Address          = 02:1A:2B',
      ':3C:4D:5E\n',
      ' 0,    730: Advertising name: WHO',
      'OP ROBIN\n',
      ' 30, 2372467560: NFC COMMS: BT addr : 0a1b2c',
      '3d4e5f\n',
      ' 30, 2372467562: NFC COMMS: Serial : XYZ9QR',
      '1234567\n',
      ' 30, 2372467563: NFC COMMS: HW family : 12\n',
    ];
    const frames = texts.map((text, i) => encodeConsole({ consoleSequence: i + 1, unixS: band.start + 10 + i, text }));
    await addFramesAt(store, deviceId, frames, band.start + 30);
    const sinks = memorySinks();
    const result = await buildDonation({ store, days: listed.map((d) => d.day), nowS: FAR_FUTURE, appVersion: '1.4.0', code: CODE, openPart: sinks.openPart });
    const jsonl = framesText(sinks, result);
    const leaked = frames.slice(0, -1).filter((frame) => jsonl.includes(frameHex(frame)));
    expect(leaked).toEqual([]);
    expect(jsonl).toContain(frameHex(frames[frames.length - 1] ?? new Uint8Array(0)));
    expect(result.removed).toMatchObject({ consoleIdentity: 8, consolePartial: 0 });
    expect(result.parts).toHaveLength(1);
    expect(manifestOf(sinks, result.parts[0]?.fileName ?? '')).toMatchObject({ removed: { consoleIdentity: 8, consolePartial: 0 } });
    await store.driver.close();
  });

  it('says unknown when model, serial, name and firmware are all null', async () => {
    const store = await openStore(openStrictDriver());
    await seedBand(store, device({ model: null, serial: null, name: null, firmware: null }));
    const days = (await listDonationDays(store, FAR_FUTURE)).map((d) => d.day);
    const sinks = memorySinks();
    const result = await buildDonation({ store, days, nowS: FAR_FUTURE, appVersion: '1.4.0', code: CODE, openPart: sinks.openPart });
    const name = result.parts[0]?.fileName ?? '';
    expect(name).toBe(`openhoop-donation-${CODE}-unknown-part-1-of-1.zip`);
    expect(manifestOf(sinks, name)).toMatchObject({ band_model: 'unknown', firmware: 'unknown' });
    expect(result.models).toEqual([null]);
    await store.driver.close();
  });
});

describe('donation size', () => {
  it.runIf(process.env.DONATION_MEASURE === '1')('measures one simulated day', () => {
    const rows = simulateDays(1, { days: 1 });
    const lines = rows.map((row, i) => `{"hex":"${frameHex(toFrame(row, i))}"}\n`).join('');
    const zipped = deflateSync(strToU8(lines), { level: 6 }).length;
    console.log(`frames ${rows.length}, jsonl ${lines.length} bytes, zipped ${zipped} bytes, ${(zipped / rows.length).toFixed(1)} bytes per frame`);
    expect(zipped).toBeGreaterThan(0);
  });
});

describe('donation helpers', () => {
  function dayWith(frames: number): DonationDay {
    return { day: '2026-11-24', asleepS: null, official: false, bands: [{ deviceId: 1, model: '5.0', day: '2026-11-24', start: 0, end: 1, tzOffsetS: 0, frameEstimate: frames }] };
  }

  it('estimates bytes and files from frame counts', () => {
    expect(estimateDonation([dayWith(100_000)], PART_LIMIT_BYTES)).toEqual({ bytes: 100_000 * ESTIMATED_ZIPPED_BYTES_PER_FRAME, files: 1 });
    expect(estimateDonation([dayWith(100_000), { ...dayWith(100_000), day: '2026-11-25' }, { ...dayWith(100_000), day: '2026-11-26' }], 25_000_000).files).toBe(
      Math.ceil((300_000 * ESTIMATED_ZIPPED_BYTES_PER_FRAME) / (25_000_000 - 1_048_576)),
    );
    expect(estimateDonation([], PART_LIMIT_BYTES)).toEqual({ bytes: 0, files: 0 });
  });

  it('generates an 8-character code from the given random bytes', () => {
    expect(donationCode(() => new Uint8Array(8))).toBe('aaaaaaaa');
    expect(donationCode(() => Uint8Array.of(30, 31, 0, 1, 2, 3, 4, 5))).toBe('9aabcdef');
  });
});
