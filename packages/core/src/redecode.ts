import { rebuildFromRaw } from './pipeline';
import type { Store } from './store/types';

// Bump when a decoder change alters the samples stored from the same frames; older samples are then re-decoded.
export const SAMPLE_DECODER_VERSION = 1;
export const SAMPLE_DECODER_VERSION_KEY = 'samples.decoderVersion';

function storedVersion(text: string | null): number {
  return text !== null && /^\d{1,9}$/.test(text) ? Number(text) : 0;
}

// The version is recorded only after every device is rebuilt and recomputed, so an interrupted run repeats on the next start.
export async function rebuildStaleSamples(store: Store, recompute: (deviceId: number) => Promise<void>): Promise<number[]> {
  if (storedVersion(await store.getSetting(SAMPLE_DECODER_VERSION_KEY)) >= SAMPLE_DECODER_VERSION) return [];
  const rebuilt: number[] = [];
  let failure: unknown = null;
  for (const device of await store.listDevices()) {
    if ((await store.listChunkIds(device.id)).length === 0) continue;
    try {
      await rebuildFromRaw(store, device.id);
      await recompute(device.id);
      rebuilt.push(device.id);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== null) throw failure instanceof Error ? failure : new Error(String(failure));
  await store.setSetting(SAMPLE_DECODER_VERSION_KEY, String(SAMPLE_DECODER_VERSION));
  return rebuilt;
}
