import { isExportType, permissionFor, permissionKey, type HcDataType } from '@/lib/healthConnectMapping';

import type { HcAvailability, HealthConnectApi } from './healthConnectApi';
import type { HealthConnectState } from './healthConnectState';

export const HC_ONBOARDING_TYPES = ['heartRate', 'restingHeartRate', 'sleep', 'exercise'] as const satisfies readonly HcDataType[];

export interface HcSwitchInput {
  state: HealthConnectState;
  granted: readonly string[];
  availability: HcAvailability | 'checking';
  types: readonly HcDataType[];
  enabled: boolean;
}

export interface HcSwitchResult {
  state: HealthConnectState;
  granted: string[];
  on: HcDataType[];
}

export function withTypes(state: HealthConnectState, types: readonly HcDataType[], isOn: (type: HcDataType) => boolean): HealthConnectState {
  const next: HealthConnectState = { ...state, export: { ...state.export }, import: { ...state.import } };
  for (const type of types) {
    if (isExportType(type)) next.export[type] = isOn(type);
    else next.import[type] = isOn(type);
  }
  if (state.import.steps && !next.import.steps) {
    next.steps = [];
    next.lastStepsImportS = null;
  }
  return next;
}

function grantedType(granted: ReadonlySet<string>, type: HcDataType): boolean {
  return granted.has(permissionKey(permissionFor(type)));
}

export async function switchHealthConnectTypes(api: HealthConnectApi, input: HcSwitchInput): Promise<HcSwitchResult> {
  if (!input.enabled) return { state: withTypes(input.state, input.types, () => false), granted: [...input.granted], on: [] };
  if (input.availability !== 'available') return { state: input.state, granted: [...input.granted], on: [] };
  const before = new Set(input.granted);
  const missing = input.types.filter((type) => !grantedType(before, type)).map(permissionFor);
  const after = missing.length === 0 ? before : await api.requestPermissions(missing);
  const on = input.types.filter((type) => grantedType(after, type));
  return { state: withTypes(input.state, input.types, (type) => on.includes(type)), granted: [...after], on };
}
