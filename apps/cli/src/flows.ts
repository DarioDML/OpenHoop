import type { BondResult, DeviceRow, DiscoveredDevice, Store, SyncOptions, SyncResult, Transport } from '@openhoop/core';
import { MAX_CLOCK_OFFSET_S, Session, recomputeDays, syncHistory } from '@openhoop/core';
import type { HelloInfo } from '@openhoop/protocol';
import { formatFirmware } from '@openhoop/protocol';
import type { Context } from './context';
import { chooseScanned, describeFound } from './devices';
import { formatIso } from './format';

const DAY_S = 86_400;
const PROGRESS_INTERVAL_MS = 1_000;

export const PAIRING_GUIDANCE = [
  'Next step: pair the band in Windows Bluetooth settings while it is in pairing mode, then run this command again.',
  'A band that is still bonded to another phone or app must be unpaired there first; a band keeps one bond at a time.',
];

export function interruptSignal(): { signal: AbortSignal; release(): void } {
  const controller = new AbortController();
  const onInterrupt = (): void => controller.abort();
  process.once('SIGINT', onInterrupt);
  return { signal: controller.signal, release: () => void process.removeListener('SIGINT', onInterrupt) };
}

export async function scanForBands(ctx: Context, transport: Transport, seconds: number): Promise<DiscoveredDevice[]> {
  ctx.log(`Scanning for bands (${seconds} s)...`);
  const found = await transport.scan(seconds * 1000);
  for (const device of found) ctx.log(`  found: ${describeFound(device)}`);
  return found;
}

export function pickBand(ctx: Context, found: readonly DiscoveredDevice[], stored: readonly DeviceRow[]): DiscoveredDevice {
  return chooseScanned(found, stored, ctx.deviceSelector);
}

export async function registerDevice(
  store: Store,
  found: DiscoveredDevice,
  info: { firmware?: string | null; serial?: string | null; model?: DeviceRow['model']; ownerSince?: number | null; configSnapshot?: string | null },
): Promise<DeviceRow> {
  const existing = (await store.listDevices()).find((d) => d.bleId === found.id);
  return store.upsertDevice({
    bleId: found.id,
    name: found.name ?? existing?.name ?? null,
    model: info.model ?? existing?.model ?? null,
    firmware: info.firmware ?? existing?.firmware ?? null,
    serial: info.serial ?? existing?.serial ?? null,
    ownerSince: info.ownerSince ?? null,
    configSnapshot: info.configSnapshot ?? existing?.configSnapshot ?? null,
  });
}

export async function bondWithGuidance(ctx: Context, transport: Transport): Promise<BondResult> {
  const result = await transport.bond();
  ctx.log(`Bonding: ${result}`);
  if (result === 'unsupported' || result === 'refused') for (const line of PAIRING_GUIDANCE) ctx.log(line);
  return result;
}

export async function openSession(ctx: Context, transport: Transport): Promise<{ session: Session; hello: HelloInfo }> {
  const session = new Session(transport);
  const hello = await session.open();
  ctx.log(`Session open: firmware ${formatFirmware(hello.firmware)}, battery ${hello.batteryPercent}%`);
  const offset = session.clockOffsetS();
  if (offset === null) ctx.log('Band clock: not set (sentinel value); samples cannot be placed in time until it is set.');
  else if (Math.abs(offset) > MAX_CLOCK_OFFSET_S) {
    ctx.log(`Band clock differs from this laptop by ${offset} s (more than ${MAX_CLOCK_OFFSET_S} s).`);
  } else ctx.log(`Band clock offset: ${offset} s`);
  return { session, hello };
}

export function clockRefusalLines(offsetS: number | null): string[] {
  const state = offsetS === null ? 'is not set (it reports a sentinel value)' : `is off by ${offsetS} s (more than ${MAX_CLOCK_OFFSET_S} s)`;
  return [
    `Sync stopped: the band's clock ${state}.`,
    'No history was read from the band and nothing was removed from it; its history is still there.',
    'OpenHoop uses the band clock to tell your records from those of a previous owner, so a wrong clock could make it throw away your own nights.',
    'Options:',
    '  - run sync again with --ignore-clock: every record is stored, including any from before you owned the band;',
    '  - or wait until OpenHoop can set the band clock in a verified way, then sync normally.',
  ];
}

export const CORRUPT_LINES = [
  'Sync stopped: the band sent the same piece of history damaged several times in a row.',
  'That piece was not stored and not acknowledged, so the band still holds it; chunks stored before it are safe.',
  'Next: move the band closer to this computer, away from other Bluetooth and Wi-Fi traffic, and run sync again.',
];

export interface SyncReport {
  sync: SyncResult;
  recomputedDays: number;
  firstDay: string | null;
  lastDay: string | null;
}

export async function syncAndRecompute(
  ctx: Context,
  store: Store,
  session: Session,
  deviceId: number,
  signal: AbortSignal,
  clockPolicy: NonNullable<SyncOptions['clockPolicy']> = 'strict',
): Promise<SyncReport> {
  const before = await store.getSyncState(deviceId);
  let lastPrinted = 0;
  const sync = await syncHistory(session, store, {
    deviceId,
    signal,
    clockPolicy,
    onProgress: (p) => {
      const now = Date.now();
      if (now - lastPrinted < PROGRESS_INTERVAL_MS) return;
      lastPrinted = now;
      const newest = p.newestSampleT === null ? 'n/a' : formatIso(p.newestSampleT);
      ctx.log(`  chunk ${p.chunks}: ${p.samples} samples stored, newest ${newest}`);
    },
  });
  ctx.log(
    `Sync ${sync.stoppedBy}: ${sync.chunks} chunks, ${sync.frames} frames, ${sync.samples} samples stored, ` +
      `${sync.discardedBeforeOwner} discarded (before owner date), ${sync.unknownFrames} unknown frames`,
  );
  if (sync.stoppedBy === 'clock') for (const line of clockRefusalLines(session.clockOffsetS())) ctx.log(line);
  if (sync.stoppedBy === 'corrupt') for (const line of CORRUPT_LINES) ctx.log(line);
  const range = await store.sampleRange(deviceId);
  if (range === null || sync.samples === 0) return { sync, recomputedDays: 0, firstDay: null, lastDay: null };
  ctx.log('Recomputing days...');
  const previousNewest = before?.newestSampleT ?? null;
  const from = previousNewest === null ? range.first : previousNewest - DAY_S;
  const days = await recomputeDays(store, {
    deviceId,
    from: Math.max(range.first, from),
    to: range.last + 1,
    profile: await ctx.loadProfile(),
    tzOffsetS: ctx.tzOffsetS,
  });
  ctx.log(`Recomputed ${days.length} days`);
  return { sync, recomputedDays: days.length, firstDay: days[0]?.day ?? null, lastDay: days[days.length - 1]?.day ?? null };
}
