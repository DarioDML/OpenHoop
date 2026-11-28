export type ChannelRole = 'pulse' | 'wear' | 'dark' | 'spo2Red' | 'spo2Ir' | 'unknown';

const WEAR_MAX_DRIVE = 500;

export function channelRole(block: { sourceA: number; driveA: number; sourceB: number; driveB: number }, slot: 'A' | 'B'): ChannelRole {
  if ((slot === 'A' ? block.driveA : block.driveB) === 0) return 'dark';
  if (block.sourceA === 1) return 'pulse';
  if (block.sourceA === 2 && block.driveA <= WEAR_MAX_DRIVE) return 'wear';
  if (block.sourceA === 3) return 'spo2Red';
  if (block.sourceA === 2) return 'spo2Ir';
  return 'unknown';
}
