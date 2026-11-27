import {
  ageOn,
  analyticsChanged,
  analyticsProfileOf,
  autoFloors,
  birthDateOf,
  emptyProfile,
  mergeProfile,
  parseBirthDate,
  parseZoneFloors,
  serializeZoneFloors,
  zoneRanges,
  zoneReference,
} from '@/data/profile';
import { createFixtureDays } from '@/data/fixtureSource';
import { parseProfileDetails, SETTING_KEYS, storeProfile } from '@/data/settingsCodec';
import { ageOnDay } from '@/data/healthspanDerived';

const TODAY = '2026-11-27';

describe('birth date', () => {
  it('accepts real past dates only', () => {
    expect(birthDateOf(1990, 6, 15, TODAY)).toBe('1990-06-15');
    expect(birthDateOf(1990, 2, 30, TODAY)).toBeNull();
    expect(birthDateOf(2027, 1, 1, TODAY)).toBeNull();
    expect(birthDateOf(1850, 1, 1, TODAY)).toBeNull();
    expect(parseBirthDate('1992-02-29', TODAY)).toBe('1992-02-29');
    expect(parseBirthDate('1991-02-29', TODAY)).toBeNull();
    expect(parseBirthDate('15/06/1990', TODAY)).toBeNull();
  });

  it('counts age to the day with a full date and by year without', () => {
    expect(ageOn({ birthYear: 1990, birthDate: '1990-12-01' }, TODAY)).toBe(35);
    expect(ageOn({ birthYear: 1990, birthDate: '1990-11-27' }, TODAY)).toBe(36);
    expect(ageOn({ birthYear: 1990 }, TODAY)).toBe(36);
    expect(ageOn({ birthYear: null }, TODAY)).toBeNull();
    expect(ageOnDay({ birthYear: 1990, maxHeartRate: null, birthDate: '1990-12-01' }, TODAY)).toBe(35);
  });

  it('keeps the birth year in step with the birth date', () => {
    const withDate = mergeProfile(emptyProfile(), { birthDate: '1988-03-04' });
    expect(withDate.birthYear).toBe(1988);
    expect(mergeProfile(withDate, { birthYear: 1990 }).birthDate).toBeNull();
    expect(mergeProfile(withDate, { birthYear: 1988 }).birthDate).toBe('1988-03-04');
    expect(mergeProfile({ birthYear: 1990, maxHeartRate: null }, {})).toEqual({ ...emptyProfile(), birthYear: 1990 });
  });
});

describe('heart-rate zones', () => {
  it('round-trips stored floors and rejects broken ones', () => {
    expect(parseZoneFloors('100,120,140,160,180')).toEqual([100, 120, 140, 160, 180]);
    expect(parseZoneFloors('100,120,110,160,180')).toBeNull();
    expect(parseZoneFloors('a,b')).toBeNull();
    expect(parseZoneFloors('')).toBeNull();
    expect(serializeZoneFloors([100.2, 120, 140, 160, 180])).toBe('100,120,140,160,180');
    expect(serializeZoneFloors(null)).toBe('');
  });

  it('parses stored profile details with safe defaults', () => {
    expect(parseProfileDetails({ birthDate: '1990-06-15', restingHeartRate: '55', zoneMode: 'custom', zoneFloors: '100,120,140,160,180' }, TODAY)).toEqual({
      birthDate: '1990-06-15',
      restingHeartRate: 55,
      zoneMode: 'custom',
      zoneFloors: [100, 120, 140, 160, 180],
    });
    expect(parseProfileDetails({ birthDate: 'x', restingHeartRate: '12', zoneMode: 'weird', zoneFloors: null }, TODAY)).toEqual({
      birthDate: null,
      restingHeartRate: null,
      zoneMode: 'auto',
      zoneFloors: null,
    });
  });

  it('sends custom floors and resting heart rate to the analytics only when set', () => {
    const custom = { ...emptyProfile(), restingHeartRate: 55, zoneMode: 'custom' as const, zoneFloors: [100, 120, 140, 160, 180] as const };
    expect(analyticsProfileOf(custom)).toEqual({ maxHr: null, birthYear: null, restingHr: 55, zoneFloors: [100, 120, 140, 160, 180] });
    expect(analyticsProfileOf({ ...custom, zoneMode: 'auto' })).toEqual({ maxHr: null, birthYear: null, restingHr: 55 });
    expect(analyticsProfileOf({ birthYear: 1990, maxHeartRate: 190 })).toEqual({ maxHr: 190, birthYear: 1990, restingHr: null });
    expect(analyticsChanged(custom, { ...custom, zoneMode: 'auto' })).toBe(true);
    expect(analyticsChanged(custom, { ...custom, birthDate: '1990-01-01' })).toBe(false);
  });

  it('shows whole-bpm ranges that match the reserve edges', () => {
    const floors = autoFloors({ rest: 63, max: 195 });
    expect(floors).not.toBeNull();
    expect(zoneRanges(floors ?? [0, 0, 0, 0, 0], 195)).toEqual([
      { zone: 1, low: 116, high: 142 },
      { zone: 2, low: 143, high: 155 },
      { zone: 3, low: 156, high: 168 },
      { zone: 4, low: 169, high: 181 },
      { zone: 5, low: 182, high: 195 },
    ]);
    expect(zoneRanges([100, 120, 140, 160, 200], 190)[4]).toEqual({ zone: 5, low: 200, high: null });
    expect(autoFloors({ rest: 190, max: 180 })).toBeNull();
  });

  it('takes the zone reference from the profile, then the nights, then defaults', () => {
    const days = createFixtureDays(new Date('2026-11-25T12:00:00Z'));
    const nowS = Date.parse('2026-11-25T12:00:00Z') / 1000;
    const measured = zoneReference(days, { birthYear: 1990, maxHeartRate: null }, nowS);
    expect(measured.restSource).toBe('measured');
    expect(measured.maxSource).toBe('age');
    expect(measured.max).toBeCloseTo(208 - 0.7 * 36);
    const own = zoneReference(days, { birthYear: null, maxHeartRate: 192, restingHeartRate: 50 }, nowS);
    expect(own).toMatchObject({ rest: 50, max: 192, restSource: 'profile', maxSource: 'profile' });
    expect(zoneReference([], { birthYear: null, maxHeartRate: null }, nowS)).toMatchObject({ rest: 60, max: 190, restSource: 'fallback', maxSource: 'fallback', measuredRest: null });
  });
});

describe('saving the profile', () => {
  function writer(): { store: { setSetting(key: string, value: string): Promise<void> }; saved: Map<string, string> } {
    const saved = new Map<string, string>();
    return { saved, store: { setSetting: async (key, value) => void saved.set(key, value) } };
  }

  it('stores every field and asks for a recompute only when an analytics input changes', async () => {
    const before = { ...emptyProfile(), birthYear: 1990 };
    const { store, saved } = writer();
    const dateOnly = await storeProfile(store, before, { birthDate: '1990-06-15' });
    expect(dateOnly.recompute).toBe(false);
    expect(saved.get(SETTING_KEYS.birthDate)).toBe('1990-06-15');
    expect(saved.get(SETTING_KEYS.birthYear)).toBe('1990');
    expect((await storeProfile(store, before, { birthDate: '1988-06-15' })).recompute).toBe(true);
    expect((await storeProfile(store, before, { restingHeartRate: 55 })).recompute).toBe(true);
    expect(saved.get(SETTING_KEYS.restingHeartRate)).toBe('55');
    expect((await storeProfile(store, before, { maxHeartRate: 190 })).recompute).toBe(true);
    expect((await storeProfile(store, before, { zoneFloors: [100, 120, 140, 160, 180] })).recompute).toBe(false);
    const custom = await storeProfile(store, before, { zoneMode: 'custom', zoneFloors: [100, 120, 140, 160, 180] });
    expect(custom.recompute).toBe(true);
    expect(saved.get(SETTING_KEYS.zoneMode)).toBe('custom');
    expect(saved.get(SETTING_KEYS.zoneFloors)).toBe('100,120,140,160,180');
    expect((await storeProfile(store, custom.profile, { zoneMode: 'custom' })).recompute).toBe(false);
  });
});
