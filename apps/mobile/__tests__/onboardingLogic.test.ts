import {
  backedUpSince,
  historyDays,
  isOnBand,
  knownRssi,
  modelFromName,
  ONBOARDING_SCREENS,
  onboardingStage,
  pagesRead,
  RECORDS_PER_PAGE,
  setupStepStatuses,
  shortBandId,
  signalStrength,
} from '@/data/onboarding';
import { defaultUserData, GOALS, parseUserData, serializeUserData } from '@/data/userData';
import { isValidIsoDate } from '@/lib/format';
import { locationAccess } from '@/ui/manage/locationSwitch';

describe('onboarding stages', () => {
  it('splits the flow into a three-step part about you and a four-step part about the band', () => {
    expect(ONBOARDING_SCREENS.map((screen) => onboardingStage(screen))).toEqual([
      { part: 'you', stage: 1, total: 3 },
      { part: 'you', stage: 2, total: 3 },
      { part: 'you', stage: 2, total: 3 },
      { part: 'you', stage: 3, total: 3 },
      { part: 'you', stage: 3, total: 3 },
      { part: 'band', stage: 1, total: 4 },
      { part: 'band', stage: 1, total: 4 },
      { part: 'band', stage: 2, total: 4 },
      { part: 'band', stage: 3, total: 4 },
      { part: 'band', stage: 4, total: 4 },
      { part: 'band', stage: 4, total: 4 },
    ]);
  });
});

describe('found bands', () => {
  it('grades the signal and treats zero or positive values as unknown', () => {
    expect(signalStrength(-48)).toBe('strong');
    expect(signalStrength(-60)).toBe('strong');
    expect(signalStrength(-61)).toBe('medium');
    expect(signalStrength(-75)).toBe('medium');
    expect(signalStrength(-90)).toBe('weak');
    expect(signalStrength(0)).toBeNull();
    expect(signalStrength(Number.NaN)).toBeNull();
    expect(knownRssi(-52.4)).toBe(-52);
    expect(knownRssi(0)).toBeNull();
    expect(knownRssi(null)).toBeNull();
  });

  it('shortens hardware ids and leaves short ids alone', () => {
    expect(shortBandId('5B:01:3C:44:91:A7')).toBe('5B01…A7');
    expect(shortBandId('4c22a1b2-0000-4000-8000-00000000ab19')).toBe('4C22…19');
    expect(shortBandId('demo-band-1')).toBe('demo-band-1');
  });

  it('reads the model from the advertised name', () => {
    expect(modelFromName('WHOOP MG (demo)')).toBe('MG');
    expect(modelFromName('WHOOP 5.0 (demo)')).toBe('5.0');
    expect(modelFromName('WHOOP 4C22')).toBeNull();
  });
});

describe('history progress', () => {
  it('counts pages from processed records and never passes the total', () => {
    expect(pagesRead(0, 9400)).toBeNull();
    expect(pagesRead(5, 9400)).toBe(1);
    expect(pagesRead(6016 * RECORDS_PER_PAGE + 3, 9400)).toBe(6016);
    expect(pagesRead(10_000 * RECORDS_PER_PAGE, 9400)).toBe(9400);
    expect(pagesRead(100, null)).toBeNull();
    expect(pagesRead(100, 0)).toBeNull();
  });

  it('estimates the days of history between the oldest sample and the newest page', () => {
    const newest = 1_764_000_000;
    expect(historyDays(newest - 20 * 86_400, newest)).toBe(20);
    expect(historyDays(newest - 3_600, newest)).toBe(1);
    expect(historyDays(null, newest)).toBeNull();
    expect(historyDays(newest + 10, newest)).toBeNull();
  });
});

describe('setup steps', () => {
  it('reads the device first, then backs up the configuration', () => {
    expect(setupStepStatuses({ stage: 'backup', backupDone: false, reachedBand: false, connection: 'disconnected', phase: null })).toEqual({
      info: 'active',
      backup: 'pending',
      history: 'pending',
      compute: 'pending',
    });
    expect(setupStepStatuses({ stage: 'backup', backupDone: false, reachedBand: true, connection: 'connected', phase: 'probing' }).info).toBe('active');
    expect(setupStepStatuses({ stage: 'backup', backupDone: false, reachedBand: true, connection: 'connected', phase: null })).toEqual({
      info: 'done',
      backup: 'active',
      history: 'pending',
      compute: 'pending',
    });
  });

  it('follows the sync phases and keeps a failed backup visible', () => {
    expect(setupStepStatuses({ stage: 'sync', backupDone: true, reachedBand: true, connection: 'syncing', phase: 'transfer' })).toEqual({
      info: 'done',
      backup: 'done',
      history: 'active',
      compute: 'pending',
    });
    expect(setupStepStatuses({ stage: 'sync', backupDone: false, reachedBand: true, connection: 'syncing', phase: 'compute' })).toEqual({
      info: 'done',
      backup: 'failed',
      history: 'done',
      compute: 'active',
    });
    expect(setupStepStatuses({ stage: 'finished', backupDone: true, reachedBand: true, connection: 'connected', phase: null })).toEqual({
      info: 'done',
      backup: 'done',
      history: 'done',
      compute: 'done',
    });
  });

  it('marks where a failed run stopped', () => {
    expect(setupStepStatuses({ stage: 'failed', backupDone: false, reachedBand: false, connection: 'disconnected', phase: null })).toEqual({
      info: 'failed',
      backup: 'pending',
      history: 'pending',
      compute: 'pending',
    });
    expect(setupStepStatuses({ stage: 'failed', backupDone: true, reachedBand: true, connection: 'disconnected', phase: null })).toEqual({
      info: 'done',
      backup: 'done',
      history: 'failed',
      compute: 'pending',
    });
  });

  it('knows when the app is talking to the band', () => {
    expect(isOnBand('connected', null)).toBe(true);
    expect(isOnBand('syncing', 'transfer')).toBe(true);
    expect(isOnBand('connected', 'probing')).toBe(false);
    expect(isOnBand('connecting', null)).toBe(false);
  });

  it('only counts a configuration read that happened during this setup', () => {
    expect(backedUpSince(1_000, 900)).toBe(true);
    expect(backedUpSince(800, 900)).toBe(false);
    expect(backedUpSince(null, 900)).toBe(false);
    expect(backedUpSince(1_000, null)).toBe(false);
  });
});

describe('onboarding user data', () => {
  it('keeps the new goals, the wear location and the official app choice', () => {
    expect(GOALS).toEqual(expect.arrayContaining(['longevity', 'strength', 'cycle', 'sleep', 'recovery', 'fitness', 'stress', 'health', 'performance']));
    const data = { ...defaultUserData(), goals: ['longevity' as const, 'cycle' as const], wearLocation: 'bicep' as const, officialAppMode: 'switch' as const };
    const parsed = parseUserData(serializeUserData(data));
    expect(parsed.goals).toEqual(['longevity', 'cycle']);
    expect(parsed.wearLocation).toBe('bicep');
    expect(parsed.officialAppMode).toBe('switch');
  });

  it('drops unknown values', () => {
    const parsed = parseUserData(JSON.stringify({ goals: ['flying', 'strength'], wearLocation: 'ankle', officialAppMode: 'both' }));
    expect(parsed.goals).toEqual(['strength']);
    expect(parsed.wearLocation).toBeNull();
    expect(parsed.officialAppMode).toBeNull();
  });
});

describe('location access', () => {
  it('tells granted, askable and blocked apart', () => {
    expect(locationAccess(true, true)).toBe('granted');
    expect(locationAccess(false, true)).toBe('askable');
    expect(locationAccess(false, false)).toBe('blocked');
  });
});

describe('worn-since date', () => {
  it('compares with the local date, so today is valid just after local midnight', () => {
    const justAfterMidnight = new Date(2026, 10, 28, 0, 30);
    expect(isValidIsoDate('2026-11-28', justAfterMidnight)).toBe(true);
    expect(isValidIsoDate('2026-11-29', justAfterMidnight)).toBe(false);
    expect(isValidIsoDate('2026-02-30', justAfterMidnight)).toBe(false);
    expect(isValidIsoDate('2014-12-31', justAfterMidnight)).toBe(false);
  });
});
