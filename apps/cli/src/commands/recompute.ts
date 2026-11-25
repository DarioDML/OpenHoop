import { rebuildFromRaw, recomputeDays } from '@stoop/core';
import type { Command, CommandResult } from '../command';
import type { Context } from '../context';
import { localDateEndToUnix, localDateToUnix } from '../dates';
import { chooseStored } from '../devices';

async function run(ctx: Context): Promise<CommandResult> {
  const store = await ctx.store();
  const device = chooseStored(await store.listDevices(), ctx.deviceSelector);
  const fromText = ctx.args.string('from');
  const toText = ctx.args.string('to');
  const rebuild = ctx.args.flag('rebuild');

  let rebuilt: { chunks: number; samples: number } | null = null;
  if (rebuild) {
    ctx.log('Rebuilding samples and derived data from the raw archive...');
    rebuilt = await rebuildFromRaw(store, device.id);
    ctx.log(`Re-decoded ${rebuilt.chunks} chunks into ${rebuilt.samples} samples`);
  }
  const range = await store.sampleRange(device.id);
  if (range === null) {
    ctx.log('No samples in the database, nothing to recompute.');
    return { json: { deviceId: device.id, rebuilt, days: 0, from: null, to: null } };
  }
  const from = fromText === undefined ? range.first : localDateToUnix(fromText, ctx.tzOffsetS, '--from');
  const to = toText === undefined ? range.last + 1 : localDateEndToUnix(toText, ctx.tzOffsetS, '--to');
  const profile = await ctx.loadProfile();
  ctx.log('Recomputing days...');
  const days = await recomputeDays(store, { deviceId: device.id, from, to, profile, tzOffsetS: ctx.tzOffsetS });
  const first = days[0]?.day ?? null;
  const last = days[days.length - 1]?.day ?? null;
  ctx.log(days.length === 0 ? 'No days fall in that range.' : `Recomputed ${days.length} days, ${first} to ${last}`);
  return { json: { deviceId: device.id, rebuilt, days: days.length, from: first, to: last } };
}

export const recompute: Command = {
  name: 'recompute',
  summary: 'Recompute day records from stored samples (or rebuild them from the raw archive)',
  usage: ['recompute [--from <date>] [--to <date>] [--rebuild]'],
  options: { from: { type: 'string' }, to: { type: 'string' }, rebuild: { type: 'boolean' } },
  bluetooth: false,
  run,
};
