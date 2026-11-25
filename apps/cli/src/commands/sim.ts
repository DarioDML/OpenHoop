import { CliError } from '../args';
import type { Command, CommandResult } from '../command';
import type { Context } from '../context';
import { bondWithGuidance, interruptSignal, openSession, pickBand, registerDevice, scanForBands, syncAndRecompute } from '../flows';

const DAY_S = 86_400;
const MAX_DAYS = 30;
const MAX_SEED = 2_147_483_647;

async function run(ctx: Context): Promise<CommandResult> {
  const days = ctx.args.int('days', 1, MAX_DAYS);
  if (days === undefined) throw new CliError(`sim needs --days <1-${MAX_DAYS}>`, 2);
  const seed = ctx.args.int('seed', 0, MAX_SEED) ?? ctx.sim?.seed ?? 1;
  const { transport } = await ctx.transport({ historyDays: days, seed });
  const store = await ctx.store();
  ctx.log(`Simulated band, seed ${seed}, ${days} days of history, into ${ctx.dbPath}`);

  const found = await scanForBands(ctx, transport, 1);
  const chosen = pickBand(ctx, found, await store.listDevices());
  const existing = (await store.listDevices()).find((d) => d.bleId === chosen.id);
  const historyStart = Math.floor(ctx.nowMs() / 1000) - (days + 1) * DAY_S;
  const ownerSince = Math.min(existing?.ownerSince ?? historyStart, historyStart);
  const device = await registerDevice(store, chosen, { model: '5.0', ownerSince });
  await transport.connect(chosen.id);
  const bond = await bondWithGuidance(ctx, transport);
  if (bond === 'refused') throw new CliError('the simulated band refused to bond');
  const { session } = await openSession(ctx, transport);
  const interrupt = interruptSignal();
  try {
    const report = await syncAndRecompute(ctx, store, session, device.id, interrupt.signal);
    const range = await store.sampleRange(device.id);
    ctx.log(`Database now holds ${range?.count ?? 0} samples. Next: npm run openhoop -- days --db "${ctx.dbPath}"`);
    return {
      json: { device: { id: device.id, bleId: device.bleId }, seed, days, samplesInDatabase: range?.count ?? 0, ...report },
      exitCode: report.sync.stoppedBy === 'complete' ? 0 : 1,
    };
  } finally {
    interrupt.release();
    await session.close();
  }
}

export const sim: Command = {
  name: 'sim',
  summary: 'Create or extend a database by syncing from a simulated band',
  usage: ['sim --days n [--seed s]'],
  options: { days: { type: 'string' }, seed: { type: 'string' } },
  bluetooth: false,
  alwaysSimulated: true,
  run,
};
