import { defaultPregnancyPrefs } from '@/data/pregnancyPrefs';
import { defaultUserData } from '@/data/userData';
import { wipedState } from '@/data/wipe';

import { fixtureAppData } from './support/appData';

describe('delete all data', () => {
  it('clears cuff readings, ECG tags and the health settings from the app data', () => {
    const before = fixtureAppData('en', {
      cuffReadings: [{ id: 1, t: 1_795_700_000, systolic: 118, diastolic: 76, pulse: 61, createdAt: 1 }],
      ecgRecordings: [{ id: 4, deviceId: 1, t: 1_795_700_000, durationMs: 30_000, sampleCount: 3840, rateHz: 128, wrist: 'left', symptoms: ['dizzy'] }],
      userData: { ...defaultUserData(), cuffLog: true, weightGoalKg: 70, pregnancyPrefs: { hideLoadTargets: true, pauseWeightGoals: true } },
      cycle: { periods: [], symptoms: [], pregnancy: { dueDay: '2027-03-01', createdAt: 1 } },
    });
    const after = wipedState(before);
    expect(after.cuffReadings).toEqual([]);
    expect(after.ecgRecordings).toEqual([]);
    expect(after.labResults).toEqual([]);
    expect(after.cycle).toEqual({ periods: [], symptoms: [], pregnancy: null });
    expect(after.userData.cuffLog).toBe(false);
    expect(after.userData.weightGoalKg).toBeNull();
    expect(after.userData.pregnancyPrefs).toEqual(defaultPregnancyPrefs());
    expect(after.settings).toMatchObject({ dataSource: 'demo', ownerSince: null, units: 'metric' });
  });
});
