import type { Permission } from 'react-native-health-connect';

import type { HealthConnectApi } from '@/data/healthConnectApi';
import { defaultHealthConnectState, type HealthConnectState } from '@/data/healthConnectState';
import { HC_ONBOARDING_TYPES, switchHealthConnectTypes, withTypes } from '@/data/healthConnectSwitch';
import { permissionFor, permissionKey } from '@/lib/healthConnectMapping';

const key = (permission: Permission): string => permissionKey(permission);

function fakeApi(grantOnRequest: (asked: Permission[]) => Permission[]): HealthConnectApi & { asked: Permission[][] } {
  const asked: Permission[][] = [];
  return {
    asked,
    availability: async () => 'available',
    grantedPermissions: async () => new Set(),
    requestPermissions: async (permissions) => {
      asked.push(permissions);
      return new Set(grantOnRequest(permissions).map(key));
    },
    insert: async () => 0,
    deleteOwn: async () => undefined,
    readAll: async () => [],
    stepsByDay: async () => [],
    openSettings: () => undefined,
    openStore: async () => undefined,
  };
}

describe('switching Health Connect types', () => {
  it('asks only for the default onboarding set in one request and turns on what was granted', async () => {
    const api = fakeApi((asked) => asked);
    const result = await switchHealthConnectTypes(api, { state: defaultHealthConnectState(), granted: [], availability: 'available', types: HC_ONBOARDING_TYPES, enabled: true });
    expect(api.asked).toHaveLength(1);
    expect(api.asked[0]).toEqual(HC_ONBOARDING_TYPES.map(permissionFor));
    expect(result.on).toEqual(['heartRate', 'restingHeartRate', 'sleep', 'exercise']);
    expect(result.state.export).toEqual({ heartRate: true, restingHeartRate: true, hrv: false, sleep: true, exercise: true, spo2: false, respiratoryRate: false, skinTemperature: false });
    expect(result.granted).toEqual(expect.arrayContaining(HC_ONBOARDING_TYPES.map((type) => key(permissionFor(type)))));
  });

  it('keeps denied types off, so a full denial leaves the switch off', async () => {
    const partial = await switchHealthConnectTypes(
      fakeApi((asked) => asked.filter((permission) => permission.recordType === 'HeartRate')),
      { state: defaultHealthConnectState(), granted: [], availability: 'available', types: HC_ONBOARDING_TYPES, enabled: true },
    );
    expect(partial.on).toEqual(['heartRate']);
    expect(partial.state.export.sleep).toBe(false);
    const denied = await switchHealthConnectTypes(fakeApi(() => []), { state: defaultHealthConnectState(), granted: [], availability: 'available', types: HC_ONBOARDING_TYPES, enabled: true });
    expect(denied.on).toEqual([]);
    expect(Object.values(denied.state.export).some(Boolean)).toBe(false);
  });

  it('does not ask again for permissions already granted', async () => {
    const api = fakeApi(() => []);
    const granted = HC_ONBOARDING_TYPES.map((type) => key(permissionFor(type)));
    const result = await switchHealthConnectTypes(api, { state: defaultHealthConnectState(), granted, availability: 'available', types: HC_ONBOARDING_TYPES, enabled: true });
    expect(api.asked).toHaveLength(0);
    expect(result.on).toEqual([...HC_ONBOARDING_TYPES]);
  });

  it('changes nothing and asks nothing when Health Connect is not available', async () => {
    const api = fakeApi((asked) => asked);
    const state = defaultHealthConnectState();
    for (const availability of ['unsupported', 'not-installed', 'update-required', 'checking'] as const) {
      const result = await switchHealthConnectTypes(api, { state, granted: [], availability, types: HC_ONBOARDING_TYPES, enabled: true });
      expect(result.on).toEqual([]);
      expect(result.state).toBe(state);
    }
    expect(api.asked).toHaveLength(0);
  });

  it('turns types off without asking, and drops the steps cache when steps go off', async () => {
    const api = fakeApi((asked) => asked);
    const state: HealthConnectState = {
      ...defaultHealthConnectState(),
      export: { ...defaultHealthConnectState().export, heartRate: true },
      import: { ...defaultHealthConnectState().import, steps: true },
      steps: [{ day: '2026-11-27', steps: 9000, origins: ['com.example'] }],
      lastStepsImportS: 1_764_000_000,
    };
    const result = await switchHealthConnectTypes(api, { state, granted: [], availability: 'available', types: ['heartRate', 'steps'], enabled: false });
    expect(api.asked).toHaveLength(0);
    expect(result.state.export.heartRate).toBe(false);
    expect(result.state.import.steps).toBe(false);
    expect(result.state.steps).toEqual([]);
    expect(result.state.lastStepsImportS).toBeNull();
    expect(withTypes(state, ['heartRate'], () => false).steps).toEqual(state.steps);
  });
});
