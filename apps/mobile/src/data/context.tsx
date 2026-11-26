import { createContext, useContext, useSyncExternalStore } from 'react';

import type { AppData, LiveData, LiveDataStore, LiveState, PendingDelete, SyncProgressView } from './types';

export const AppDataContext = createContext<AppData | null>(null);
export const LiveDataContext = createContext<LiveDataStore | null>(null);

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside an AppDataContext provider');
  return value;
}

function missingLiveData(): never {
  throw new Error('live data hooks must be used inside a LiveDataContext provider');
}

function useLiveField<K extends keyof LiveData>(key: K): LiveData[K] {
  const store = useContext(LiveDataContext) ?? missingLiveData();
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot()[key]);
}

export function useLive(): LiveState {
  return useLiveField('live');
}

export function useSyncProgress(): SyncProgressView | null {
  return useLiveField('syncProgress');
}

export function usePendingDelete(): PendingDelete | null {
  return useLiveField('pendingDelete');
}
