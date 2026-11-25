import { GATT, parseHeartRateMeasurement } from '@openhoop/protocol';
import type { Clock } from './session';
import { systemClock } from './session';
import type { SampleRow, Store } from './store/types';
import type { Transport } from './transport';

export interface RecordHeartRateOptions {
  deviceId: number;
  signal: AbortSignal;
  onBeat?: (hr: number, rrMs: number[]) => void;
  clock?: Clock;
  flushIntervalMs?: number;
}

interface Bucket {
  t: number;
  hr: number | null;
  rr: number[];
}

export async function recordHeartRate(
  transport: Transport,
  store: Store,
  opts: RecordHeartRateOptions,
): Promise<{ seconds: number }> {
  const clock = opts.clock ?? systemClock;
  const flushIntervalMs = Math.min(opts.flushIntervalMs ?? 10_000, 10_000);
  if (opts.signal.aborted) return { seconds: 0 };

  let current: Bucket | null = null;
  let ready: SampleRow[] = [];
  let seconds = 0;
  let writing: Promise<void> = Promise.resolve();
  let failure: unknown = null;

  const toRow = (bucket: Bucket): SampleRow => ({
    deviceId: opts.deviceId,
    t: bucket.t,
    source: 'hrm',
    hr: bucket.hr,
    rr: bucket.rr,
    steps: null,
    skinTempC: null,
    spo2Raw: null,
    state: null,
    motionG: null,
    chunkId: null,
  });

  const closeBucketBefore = (second: number): void => {
    if (current !== null && current.t < second) {
      ready.push(toRow(current));
      current = null;
    }
  };

  const flush = (): Promise<void> => {
    const batch = ready;
    ready = [];
    if (batch.length === 0) return writing;
    writing = writing.then(async () => {
      if (failure !== null) return;
      try {
        await store.insertSamples(batch);
        seconds += batch.length;
      } catch (error) {
        failure = error;
      }
    });
    return writing;
  };

  const onData = (data: Uint8Array): void => {
    const { heartRate, rrMs } = parseHeartRateMeasurement(data);
    if (heartRate <= 0 && rrMs.length === 0) return;
    const second = Math.floor(clock.now() / 1000);
    closeBucketBefore(second);
    const bucket: Bucket = current ?? { t: second, hr: null, rr: [] };
    if (heartRate > 0) bucket.hr = heartRate;
    bucket.rr.push(...rrMs);
    current = bucket;
    opts.onBeat?.(heartRate, rrMs);
  };

  const unsubscribe = await transport.subscribe(GATT.heartRateService, GATT.heartRateMeasurement, onData);

  await new Promise<void>((resolve) => {
    let cancelTimer: () => void = () => undefined;
    const tick = (): void => {
      closeBucketBefore(Math.floor(clock.now() / 1000));
      void flush();
      cancelTimer = clock.schedule(flushIntervalMs, tick);
    };
    cancelTimer = clock.schedule(flushIntervalMs, tick);
    const stop = (): void => {
      cancelTimer();
      opts.signal.removeEventListener('abort', stop);
      removeDisconnect();
      resolve();
    };
    const removeDisconnect = transport.onDisconnect(stop);
    opts.signal.addEventListener('abort', stop);
    if (opts.signal.aborted) stop();
  });

  try {
    await unsubscribe();
  } catch {
    // the link may already be gone
  }
  closeBucketBefore(Number.POSITIVE_INFINITY);
  await flush();
  if (failure !== null) throw failure instanceof Error ? failure : new Error(String(failure));
  return { seconds };
}
