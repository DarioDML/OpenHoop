import { decodeEventDetail, fromHex } from '@openhoop/protocol';
import type { EventDetail } from '@openhoop/protocol';
import type { EventRow, Store } from './store/types';
import type { WearPhase } from './wear';
import { loadWearChanges } from './wear';

export interface BandStatus {
  wear: { phase: WearPhase; since: number } | null;
  charging: { charging: boolean; at: number } | null;
  boot: {
    lastBootAt: number | null;
    bootCount: number | null;
    rebootReason: number | null;
    signalProcessingVersion: string | null;
  };
}

const CHARGING_ON = 7;
const CHARGING_OFF = 8;
const BOOT = 15;
const BOOT_DEVICE_INFO = 61;
const BOOT_COUNTER = 62;
const CHARGER_REPORT = 110;
const REBOOT_REASON = 112;
const CHARGER_STATUS = 117;
const RECENT = 20;

function detailOf(row: EventRow): EventDetail | null {
  if (!/^(?:[0-9a-f]{2})*$/i.test(row.payloadHex)) return null;
  return decodeEventDetail(row.event, fromHex(row.payloadHex));
}

function chargingOf(row: EventRow): boolean | null {
  if (row.event === CHARGING_ON) return true;
  if (row.event === CHARGING_OFF) return false;
  const detail = detailOf(row);
  return detail?.kind === 'chargerStatus' || detail?.kind === 'chargerReport' ? detail.charging : null;
}

async function newestDetail(store: Store, deviceId: number, event: number): Promise<EventDetail | null> {
  for (const row of await store.latestEventsOf(deviceId, [event], RECENT)) {
    const detail = detailOf(row);
    if (detail !== null) return detail;
  }
  return null;
}

export async function latestBandStatus(store: Store, deviceId: number): Promise<BandStatus> {
  const changes = await loadWearChanges(store, deviceId);
  const lastChange = changes[changes.length - 1];

  let charging: BandStatus['charging'] = null;
  for (const row of await store.latestEventsOf(deviceId, [CHARGING_ON, CHARGING_OFF, CHARGER_REPORT, CHARGER_STATUS], RECENT)) {
    const state = chargingOf(row);
    if (state === null) continue;
    charging = { charging: state, at: row.t };
    break;
  }

  const [boot] = await store.latestEventsOf(deviceId, [BOOT], 1);
  const count = await newestDetail(store, deviceId, BOOT_COUNTER);
  const reboot = await newestDetail(store, deviceId, REBOOT_REASON);
  const info = await newestDetail(store, deviceId, BOOT_DEVICE_INFO);
  const version = info?.kind === 'bootInfo' ? info.signalProcessingVersion : null;

  return {
    wear: lastChange === undefined ? null : { phase: lastChange.phase, since: lastChange.t },
    charging,
    boot: {
      lastBootAt: boot?.t ?? null,
      bootCount: count?.kind === 'bootCounter' ? count.bootCount : null,
      rebootReason: reboot?.kind === 'reboot' ? reboot.preRebootReason : null,
      signalProcessingVersion: version === null ? null : `${version.major}.${version.minor}.${version.patch}`,
    },
  };
}
