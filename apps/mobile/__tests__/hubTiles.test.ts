import { createFixtureDays } from '@/data/fixtureSource';
import { defaultUserData } from '@/data/userData';
import { VO2_MIN_NIGHTS, VO2_WINDOW_NIGHTS } from '@/data/healthspanDerived';
import { translate, type TranslationKey, type TranslationParams } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { todayIso } from '@/lib/format';
import { HUB_TILE_IDS, bodyAgeCaption, hubTileText, type HubInput } from '@/ui/health/hubTiles';

import { FIXTURE_NOW } from './support/appData';

const CAPTION_LIMIT = 26;

function input(overrides: Partial<HubInput> = {}): HubInput {
  return {
    days: createFixtureDays(FIXTURE_NOW),
    profile: { birthYear: 1981, maxHeartRate: null },
    userData: defaultUserData(),
    labResults: [],
    bodyMeasurements: [],
    cycle: { periods: [], symptoms: [], pregnancy: null },
    ecgRecordings: [],
    model: '5.0',
    units: 'metric',
    today: todayIso(FIXTURE_NOW),
    ...overrides,
  };
}

const cases: ReadonlyArray<[string, HubInput]> = [
  ['fixture data', input()],
  ['no data at all', input({ days: [], profile: { birthYear: null, maxHeartRate: null } })],
  [
    'logged labs, periods, weight and an ECG',
    input({
      model: 'MG',
      labResults: [{ id: 1, biomarker: 'glucose', value: 5, unit: 'mmol/L', day: '2026-11-01', refLow: 3.9, refHigh: 5.6, note: null, createdAt: 0 }],
      bodyMeasurements: [{ id: 1, day: '2026-11-20', weightKg: 78, bodyFatPct: null, createdAt: 0, source: 'manual', origin: null }],
      cycle: { periods: [{ id: 1, startDay: '2026-11-10', endDay: '2026-11-14', flow: 2, createdAt: 0 }], symptoms: [], pregnancy: null },
      ecgRecordings: [{ id: 1, deviceId: 1, t: Math.floor(FIXTURE_NOW.getTime() / 1000) - 3600, durationMs: 30_000, sampleCount: 3900, rateHz: 130, wrist: 'left', symptoms: [] }],
    }),
  ],
];

const CAPTION_KEYS: ReadonlyArray<[TranslationKey, TranslationParams?]> = [
  ['health.hub.tile.bodyAgeWhy.no-vo2'],
  ['health.hub.tile.bodyAgeWhy.no-sex'],
  ['health.hub.tile.bodyAgeWhy.other-sex'],
  ['health.hub.tile.bodyAgeWhy.out-of-range'],
  ['health.bodyAge.sourceShort.fitness'],
  ['health.bodyAge.sourceShort.pheno'],
  ['health.hub.tile.vitalsWithin'],
  ['health.hub.tile.noVitalsHint'],
  ['health.hub.tile.nightsLeft', { count: 14 }],
  ['health.hub.tile.calibratingHint'],
  ['health.hub.tile.stressDays', { have: 13, need: 14 }],
  ['health.hub.tile.noStressHint'],
  ['health.hub.tile.ecgLast', { day: '30 Nov' }],
  ['health.hub.tile.ecgTrace'],
  ['health.hub.tile.cycleNext', { days: 28 }],
  ['health.hub.tile.cycleNeedsHistory'],
  ['health.hub.tile.cycleNoneHint'],
  ['health.hub.tile.labsInside'],
  ['health.hub.tile.labsEntered'],
  ['health.hub.tile.labsNoneHint'],
  ['health.hub.tile.vo2Level.poor'],
  ['health.hub.tile.vo2Level.fair'],
  ['health.hub.tile.vo2Level.good'],
  ['health.hub.tile.vo2Level.excellent'],
  ['health.hub.tile.vo2Level.superior'],
  ['health.vo2max.short.no-max-hr'],
  ['health.vo2max.short.no-resting-hr', { min: VO2_MIN_NIGHTS, window: VO2_WINDOW_NIGHTS, nights: 13 }],
  ['health.vo2max.short.out-of-range'],
  ['health.vo2max.short.norm.no-age'],
  ['health.vo2max.short.norm.no-sex'],
  ['health.vo2max.short.norm.other-sex'],
  ['health.vo2max.short.norm.age-out-of-range'],
  ['health.hub.tile.bodyFromHc'],
  ['health.hub.tile.bodyManual', { day: '30 Nov' }],
  ['health.hub.tile.bodyProfile'],
  ['health.hub.tile.bodyNoneHint'],
];

describe('hub caption strings', () => {
  it.each(['en', 'nl'] as const)('fit two short lines on an S24 tile in %s', (language) => {
    for (const [key, params] of CAPTION_KEYS) {
      const text = translate(language, key, params);
      expect({ key, text, fits: Array.from(text).length <= CAPTION_LIMIT }).toEqual({ key, text, fits: true });
    }
  });

  it.each(['en', 'nl'] as const)('keep the body age source with a two-digit gap in %s', (language) => {
    const t: TFunction = (key, params) => translate(language, key, params);
    for (const source of ['fitness', 'pheno'] as const) {
      for (const ownAge of [52.3, 27.7, 40]) {
        const caption = bodyAgeCaption({ kind: 'age', source, age: 40, ownAge, day: null }, { t, language });
        expect(caption.startsWith(translate(language, `health.hub.tile.bodyAgeSource.${source}`))).toBe(true);
        expect(Array.from(caption).length).toBeLessThanOrEqual(CAPTION_LIMIT);
      }
    }
  });
});

describe('hub tiles', () => {
  it.each(['en', 'nl'] as const)('keep every caption to one short line in %s', (language) => {
    const t: TFunction = (key, params) => translate(language, key, params);
    for (const [, hub] of cases) {
      for (const id of HUB_TILE_IDS) {
        const tile = hubTileText(id, hub, { t, language });
        expect({ id, caption: tile.caption ?? '' }).toEqual({ id, caption: expect.stringMatching(new RegExp(`^.{0,${CAPTION_LIMIT}}$`, 'u')) });
      }
    }
  });
});
