export interface HrBroadcastState {
  on: boolean;
  at: number;
}

export function hrBroadcastKey(deviceId: number): string {
  return `hrBroadcast.${deviceId}`;
}

export function parseHrBroadcast(raw: string | null): HrBroadcastState | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { on, at } = parsed as Record<string, unknown>;
  if (typeof on !== 'boolean' || typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return null;
  return { on, at };
}

export function serializeHrBroadcast(state: HrBroadcastState): string {
  return JSON.stringify({ on: state.on, at: state.at });
}
