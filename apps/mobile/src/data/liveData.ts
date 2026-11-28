import type { LiveData } from './types';

const LIVE_DATA_KEYS: ReadonlySet<string> = new Set<keyof LiveData>(['live', 'syncProgress', 'pendingDelete', 'ecgLive', 'rawLive']);

export function changesAppData(change: object): boolean {
  return Object.keys(change).some((key) => !LIVE_DATA_KEYS.has(key));
}
