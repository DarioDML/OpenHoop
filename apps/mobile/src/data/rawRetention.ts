import type { RawRetentionDays, UserData } from './userData';

const DAY_S = 86_400;

export type PruneRaw = (deviceId: number, beforeS: number) => Promise<unknown>;

export function retentionCutoff(days: RawRetentionDays | null, nowS: number): number | null {
  return days === null ? null : nowS - days * DAY_S;
}

export async function applyRawRetention(prune: PruneRaw, deviceId: number | null, days: RawRetentionDays | null, nowS: number): Promise<boolean> {
  const cutoff = retentionCutoff(days, nowS);
  if (deviceId === null || cutoff === null) return false;
  await prune(deviceId, cutoff);
  return true;
}

export function retentionChanged(patch: Partial<UserData>): boolean {
  return patch.rawRetentionDays !== undefined;
}
