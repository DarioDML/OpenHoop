import type { DeviceStatus, LiveState } from '@/data/types';

export type BandLink =
  | { kind: 'live'; bpm: number | null }
  | { kind: 'connected' }
  | { kind: 'connecting' }
  | { kind: 'syncing' }
  | { kind: 'disconnected' }
  | { kind: 'unpaired' };

export function bandLink(device: DeviceStatus, live: LiveState): BandLink {
  if (live.active) return { kind: 'live', bpm: live.heartRate };
  if (device.name === null) return { kind: 'unpaired' };
  switch (device.connection) {
    case 'connected':
      return { kind: 'connected' };
    case 'connecting':
      return { kind: 'connecting' };
    case 'syncing':
      return { kind: 'syncing' };
    case 'disconnected':
      return { kind: 'disconnected' };
  }
}
