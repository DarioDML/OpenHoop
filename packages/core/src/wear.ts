import { decodeEventDetail, fromHex } from '@openhoop/protocol';
import type { EventRow, Store } from './store/types';

export type WearPhase = 'on' | 'off';

export interface WearChange {
  t: number;
  phase: WearPhase;
}

const WRIST_ON = 9;
const WRIST_OFF = 10;
const WEAR_DETECT = 120;
export const WEAR_EVENTS: readonly number[] = [WRIST_ON, WRIST_OFF, WEAR_DETECT];

function phaseOf(row: EventRow): WearPhase | null {
  if (row.event === WRIST_ON) return 'on';
  if (row.event === WRIST_OFF) return 'off';
  if (row.event !== WEAR_DETECT || !/^(?:[0-9a-f]{2})*$/i.test(row.payloadHex)) return null;
  const detail = decodeEventDetail(WEAR_DETECT, fromHex(row.payloadHex));
  if (detail?.kind !== 'wearDetect') return null;
  if (detail.toState === 'onWrist' || detail.toState === 'onWristUnconfirmed') return 'on';
  return detail.toState === 'offWrist' ? 'off' : null;
}

export function wearChanges(rows: readonly EventRow[]): WearChange[] {
  const sorted = [...rows].sort((a, b) => a.t - b.t);
  const out: WearChange[] = [];
  for (const row of sorted) {
    const phase = phaseOf(row);
    if (phase === null || out[out.length - 1]?.phase === phase) continue;
    out.push({ t: row.t, phase });
  }
  return out;
}

export function loadWearChanges(store: Store, deviceId: number): Promise<WearChange[]> {
  return store.eventsOf(deviceId, WEAR_EVENTS).then(wearChanges);
}

export function wornSeconds(changes: readonly WearChange[], from: number, to: number): { wornS: number; knownS: number } | null {
  let wornS = 0;
  let knownS = 0;
  let seen = false;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (change === undefined || change.t >= to) break;
    seen = true;
    const next = changes[i + 1]?.t ?? Number.POSITIVE_INFINITY;
    const span = Math.min(next, to) - Math.max(change.t, from);
    if (span <= 0) continue;
    knownS += span;
    if (change.phase === 'on') wornS += span;
  }
  return seen ? { wornS, knownS } : null;
}

export function phaseAt(changes: readonly WearChange[]): (t: number) => WearPhase | null {
  let i = -1;
  return (t) => {
    if (i >= 0 && (changes[i]?.t ?? 0) > t) i = -1;
    while (i + 1 < changes.length && (changes[i + 1]?.t ?? Number.POSITIVE_INFINITY) <= t) i++;
    return i >= 0 ? (changes[i]?.phase ?? null) : null;
  };
}
