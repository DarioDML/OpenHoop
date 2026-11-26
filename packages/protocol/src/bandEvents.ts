import { ByteReader } from './bytes';
import type { FirmwareVersion } from './firmware';
import type { FieldIndex } from './schema';
import { readRaw, schema, spec } from './schema';

export type WearState = 'boot' | 'onWristUnconfirmed' | 'onWrist' | 'offWrist' | 'unknown';

export interface WearDetect {
  kind: 'wearDetect';
  fromState: WearState;
  toState: WearState;
  fromCode: number;
  toCode: number;
  reason: number;
  secondsInState: number;
  secondsCapped: boolean;
  opticalNear: number;
  opticalRatio: number;
  ambient: number;
  sleepFlag: number;
  recordCount: number;
  rangeStability: number;
  orientChanges: number;
  accelX: number;
  accelY: number;
  heartRateWindows: number;
  peakHeartRate: number;
  peakHeartRateDeviation: number;
  harmonicShare: number;
  skinTempC: number | null;
  heartRateCount: number;
}

export type EventDetail =
  | WearDetect
  | { kind: 'chargerStatus'; chargerStatus: number; charging: boolean }
  | { kind: 'chargerReport'; chargerStatus: number; charging: boolean }
  | { kind: 'reboot'; preRebootReason: number }
  | { kind: 'bootInfo'; firmware: FirmwareVersion; signalProcessingVersion: { major: number; minor: number; patch: number } }
  | { kind: 'bootCounter'; bootCount: number };

const U16_MAX = 0xffff;
const SKIN_TEMP_BASE_C = 10;

interface Layout {
  length: number;
  revision: number;
  fields: FieldIndex;
}

function reader(layout: Layout, payload: Uint8Array): ((name: string) => number) | null {
  if (payload.length !== layout.length) return null;
  const r = new ByteReader(payload);
  const read = (name: string): number => {
    const field = spec(layout.fields, name);
    const raw = readRaw(r, field);
    return typeof field.scale === 'number' ? raw * field.scale : raw;
  };
  return read('revision') === layout.revision ? read : null;
}

function wearState(code: number): WearState {
  const label = schema.bandEvents.wearDetect.states.get(code);
  return label === 'boot' || label === 'onWristUnconfirmed' || label === 'onWrist' || label === 'offWrist' ? label : 'unknown';
}

function wearDetect(payload: Uint8Array): WearDetect | null {
  const read = reader(schema.bandEvents.wearDetect, payload);
  if (read === null) return null;
  const seconds = read('seconds_in_state');
  const skinAbove = read('skin_temp_above_10c');
  return {
    kind: 'wearDetect',
    fromState: wearState(read('from_state')),
    toState: wearState(read('to_state')),
    fromCode: read('from_state'),
    toCode: read('to_state'),
    reason: read('reason'),
    secondsInState: seconds,
    secondsCapped: seconds === U16_MAX,
    opticalNear: read('opt_ir_near'),
    opticalRatio: read('opt_ir_ratio'),
    ambient: read('opt_ambient'),
    sleepFlag: read('sleep_flag'),
    recordCount: read('record_count'),
    rangeStability: read('range_stability'),
    orientChanges: read('orient_changes_60'),
    accelX: read('accel_x'),
    accelY: read('accel_y'),
    heartRateWindows: read('hr_window_count'),
    peakHeartRate: read('hr_peak'),
    peakHeartRateDeviation: read('hr_peak_deviation'),
    harmonicShare: read('harmonic_share'),
    skinTempC: skinAbove === 0 ? null : SKIN_TEMP_BASE_C + skinAbove,
    heartRateCount: read('hr_count'),
  };
}

export function decodeEventDetail(event: number, payload: Uint8Array): EventDetail | null {
  const e = schema.bandEvents;
  switch (event) {
    case 61: {
      const read = reader(e.bootInfo, payload);
      if (read === null) return null;
      return {
        kind: 'bootInfo',
        firmware: { major: read('fw_major'), minor: read('fw_minor'), patch: read('fw_patch'), build: read('fw_build') },
        signalProcessingVersion: { major: read('sigproc_major'), minor: read('sigproc_minor'), patch: read('sigproc_patch') },
      };
    }
    case 62: {
      const read = reader(e.bootCounter, payload);
      return read === null ? null : { kind: 'bootCounter', bootCount: read('boot_count') };
    }
    case 110: {
      const read = reader(e.chargerReport, payload);
      return read === null ? null : { kind: 'chargerReport', chargerStatus: read('charger_status'), charging: read('charging') !== 0 };
    }
    case 112: {
      const read = reader(e.reboot, payload);
      return read === null ? null : { kind: 'reboot', preRebootReason: read('pre_reboot_reason') };
    }
    case 117: {
      const read = reader(e.chargerStatus, payload);
      if (read === null) return null;
      const chargerStatus = read('charger_status');
      return { kind: 'chargerStatus', chargerStatus, charging: chargerStatus !== 0 };
    }
    case 120:
      return wearDetect(payload);
    default:
      return null;
  }
}
