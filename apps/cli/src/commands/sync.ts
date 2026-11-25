import { CliError } from '../args';
import type { Command, CommandResult } from '../command';
import type { Context } from '../context';
import { parseOwnerSince } from '../dates';
import { chooseStored, modelFromText } from '../devices';
import {
  PAIRING_GUIDANCE,
  bondWithGuidance,
  interruptSignal,
  openSession,
  pickBand,
  registerDevice,
  scanForBands,
  syncAndRecompute,
} from '../flows';
import { formatIso } from '../format';
import type { DeviceRow } from '@stoop/core';

const SCAN_SECONDS = 8;

function refusal(): CliError {
  return new CliError(
    [
      'Refusing to sync: this device has no owner-since date.',
      'A band can still hold history from its previous owner. Records from before that date are not yours:',
      'Stoop acknowledges them to the band but discards them, and never stores them.',
      'Run again with --owner-since <date you got the band>, for example: sync --owner-since 2027-01-31',
    ].join('\n'),
  );
}

function storedCandidate(devices: readonly DeviceRow[], selector: string | undefined): DeviceRow | null {
  try {
    return chooseStored(devices, selector);
  } catch {
    return null;
  }
}

async function run(ctx: Context): Promise<CommandResult> {
  const ownerText = ctx.args.string('owner-since');
  const ownerSince = ownerText === undefined ? null : parseOwnerSince(ownerText, ctx.tzOffsetS, ctx.nowMs() / 1000);
  const store = await ctx.store();
  const stored = await store.listDevices();
  const candidate = storedCandidate(stored, ctx.deviceSelector);
  if (ownerSince === null && stored.length <= 1 && (candidate?.ownerSince ?? null) === null) throw refusal();

  const { transport } = await ctx.transport();
  const found = await scanForBands(ctx, transport, SCAN_SECONDS);
  const chosen = pickBand(ctx, found, stored);
  const known = stored.find((d) => d.bleId === chosen.id) ?? null;
  if (ownerSince === null && (known?.ownerSince ?? null) === null) throw refusal();
  const device = await registerDevice(store, chosen, { model: modelFromText(chosen.name), ownerSince });
  const clockPolicy = ctx.args.flag('ignore-clock') ? 'store-all' : 'strict';
  if (clockPolicy === 'store-all') {
    ctx.log(
      'WARNING: --ignore-clock: the band clock is not trusted, so nothing is filtered by date and records from before you owned the band may be stored.',
    );
  } else if (ownerSince !== null) {
    ctx.log(`Owner since ${formatIso(ownerSince)}: history from before this moment is discarded, not stored.`);
  }

  ctx.log(`Connecting to ${chosen.name ?? chosen.id}...`);
  await transport.connect(chosen.id);
  const bond = await bondWithGuidance(ctx, transport);
  if (bond === 'refused') throw new CliError(['The band refused to bond.', ...PAIRING_GUIDANCE].join('\n'));

  const { session, hello } = await openSession(ctx, transport);
  const interrupt = interruptSignal();
  try {
    const report = await syncAndRecompute(ctx, store, session, device.id, interrupt.signal, clockPolicy);
    if (report.sync.stoppedBy === 'locked') {
      ctx.log('The band is locked: it sent no history. Run `triage` for details, or `live --record` to record the standard heart rate.');
    }
    const firmware = `${hello.firmware.major}.${hello.firmware.minor}.${hello.firmware.patch}.${hello.firmware.build}`;
    await registerDevice(store, chosen, { firmware });
    return {
      json: { device: { id: device.id, bleId: device.bleId, firmware }, ownerSince, ...report },
      exitCode: report.sync.stoppedBy === 'complete' ? 0 : 1,
    };
  } finally {
    interrupt.release();
    await session.close();
  }
}

export const sync: Command = {
  name: 'sync',
  summary: 'Bond, read the history from the band, store it and recompute the days',
  usage: ['sync [--owner-since <ISO date>] [--ignore-clock]'],
  options: { 'owner-since': { type: 'string' }, 'ignore-clock': { type: 'boolean' } },
  bluetooth: true,
  run,
};
