import { decodePackPayload, fromHex } from '@openhoop/protocol';
import type { PackInfo, PackReading } from '@openhoop/protocol';
import type { PackEventRow, Store } from './store/types';

export interface BatteryPackState {
  socPercent: number | null;
  socAt: number | null;
  info: PackInfo | null;
  infoAt: number | null;
}

const RECENT_REPORTS = 200;

function reading(row: PackEventRow): PackReading | null {
  if (!/^(?:[0-9a-f]{2})*$/.test(row.payloadHex)) return null;
  return decodePackPayload(row.event, fromHex(row.payloadHex));
}

export async function latestBatteryPack(store: Store, deviceId: number): Promise<BatteryPackState | null> {
  const state: BatteryPackState = { socPercent: null, socAt: null, info: null, infoAt: null };
  for (const row of await store.listPackEvents(deviceId, RECENT_REPORTS)) {
    const pack = reading(row);
    if (pack === null) continue;
    if (state.socAt === null && pack.socPercent !== null) {
      state.socPercent = pack.socPercent;
      state.socAt = row.t;
    }
    if (state.infoAt === null && pack.info !== undefined) {
      state.info = pack.info;
      state.infoAt = row.t;
    }
    if (state.socAt !== null && state.infoAt !== null) break;
  }
  return state.socAt === null && state.infoAt === null ? null : state;
}
