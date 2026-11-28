import { createFixtureDays } from '@/data/fixtureSource';
import { defaultUserData } from '@/data/userData';
import { translate } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { todayIso } from '@/lib/format';
import { HUB_TILE_IDS, hubTileText, type HubInput } from '@/ui/health/hubTiles';

import { FIXTURE_NOW } from './support/appData';

const CAPTION_LIMIT = 24;

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
