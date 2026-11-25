import { recordHeartRate } from '@openhoop/core';
import { GATT, parseHeartRateMeasurement } from '@openhoop/protocol';
import type { Command, CommandResult } from '../command';
import type { Context } from '../context';
import { modelFromText } from '../devices';
import { interruptSignal, pickBand, registerDevice, scanForBands } from '../flows';
import { formatIso } from '../format';

const DEFAULT_SECONDS = 30;
const MAX_SECONDS = 86_400;
const SCAN_SECONDS = 8;

interface Reading {
  t: number;
  hr: number;
  rrMs: number[];
}

function waitForAbort(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish);
  });
}

async function run(ctx: Context): Promise<CommandResult> {
  const seconds = ctx.args.int('seconds', 1, MAX_SECONDS) ?? DEFAULT_SECONDS;
  const record = ctx.args.flag('record');
  const { transport } = await ctx.transport();
  const store = await ctx.store();
  const found = await scanForBands(ctx, transport, SCAN_SECONDS);
  const chosen = pickBand(ctx, found, await store.listDevices());
  ctx.log(`Connecting to ${chosen.name ?? chosen.id} (no bond needed for the standard heart-rate service)...`);
  await transport.connect(chosen.id);

  const readings: Reading[] = [];
  const onBeat = (hr: number, rrMs: number[]): void => {
    const t = Math.floor(ctx.nowMs() / 1000);
    readings.push({ t, hr, rrMs });
    const rr = rrMs.length === 0 ? 'no R-R' : `R-R ${rrMs.join(', ')} ms`;
    ctx.log(`${formatIso(t)}  HR ${String(hr).padStart(3)} bpm  ${rr}`);
  };

  const interrupt = interruptSignal();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), seconds * 1000);
  const stop = (): void => timeout.abort();
  interrupt.signal.addEventListener('abort', stop);
  ctx.log(`Live heart rate for ${seconds} s${record ? ', recording to the database' : ''}. Ctrl-C stops early.`);
  let recordedSeconds: number | null = null;
  try {
    if (record) {
      const device = await registerDevice(store, chosen, { model: modelFromText(chosen.name) });
      const outcome = await recordHeartRate(transport, store, { deviceId: device.id, signal: timeout.signal, onBeat });
      recordedSeconds = outcome.seconds;
    } else {
      const unsubscribe = await transport.subscribe(GATT.heartRateService, GATT.heartRateMeasurement, (data) => {
        const { heartRate, rrMs } = parseHeartRateMeasurement(data);
        if (heartRate > 0 || rrMs.length > 0) onBeat(heartRate, rrMs);
      });
      await waitForAbort(timeout.signal, seconds * 1000 + 1_000);
      await unsubscribe().catch(() => undefined);
    }
  } finally {
    clearTimeout(timer);
    interrupt.signal.removeEventListener('abort', stop);
    interrupt.release();
  }

  if (readings.length === 0) {
    ctx.log('No heart-rate notifications arrived. Wear the band, and check that nothing else is connected to it.');
  }
  if (recordedSeconds !== null) ctx.log(`Recorded ${recordedSeconds} one-second samples (source hrm) to ${ctx.dbPath}`);
  return {
    json: { device: chosen, seconds, recorded: record, recordedSeconds, readings },
    exitCode: readings.length === 0 ? 1 : 0,
  };
}

export const live: Command = {
  name: 'live',
  summary: 'Live heart rate from the standard Bluetooth profile (works on a locked band)',
  usage: ['live [--seconds n] [--record]'],
  options: { seconds: { type: 'string' }, record: { type: 'boolean' } },
  bluetooth: true,
  run,
};
