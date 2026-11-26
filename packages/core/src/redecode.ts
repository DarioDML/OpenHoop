import { rebuildFromRaw } from './pipeline';
import type { Store } from './store/types';

// Bump when a decoder change alters the samples stored from the same frames; older samples are then re-decoded.
export const SAMPLE_DECODER_VERSION = 1;
export const SAMPLE_DECODER_VERSION_KEY = 'samples.decoderVersion';

function storedVersion(text: string | null): number {
  return text !== null && /^\d{1,9}$/.test(text) ? Number(text) : 0;
}

export async function rebuildStaleSamples(store: Store): Promise<number[]> {
  if (storedVersion(await store.getSetting(SAMPLE_DECODER_VERSION_KEY)) >= SAMPLE_DECODER_VERSION) return [];
  const rebuilt: number[] = [];
  for (const device of await store.listDevices()) {
    if ((await store.listChunkIds(device.id)).length === 0) continue;
    await rebuildFromRaw(store, device.id);
    rebuilt.push(device.id);
  }
  await store.setSetting(SAMPLE_DECODER_VERSION_KEY, String(SAMPLE_DECODER_VERSION));
  return rebuilt;
}
