import { explainMissing, type MissingInput } from '@/data/explainMissing';
import { createFixtureDays } from '@/data/fixtureSource';
import { firstWeekItems, readinessNightsLeft, remaining } from '@/data/progress';
import type { TermId } from '@/data/terms';
import { translate } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { missingStatus, whyText } from '@/ui/explain/whyText';

import { FIXTURE_NOW } from './support/appData';
import { FIRST_NIGHT_NOW_S, FIRST_NIGHT_SYNC_S, firstNightDay } from './support/firstNight';

const input = (term: TermId, reason: string | null, over: Partial<MissingInput> = {}): MissingInput => ({
  term,
  reason,
  days: [firstNightDay()],
  index: 0,
  nowS: FIRST_NIGHT_NOW_S,
  lastSyncAt: FIRST_NIGHT_SYNC_S,
  profileGaps: [],
  ...over,
});
const tEn: TFunction = (k, p) => translate('en', k, p);
const tNl: TFunction = (k, p) => translate('nl', k, p);

it('lists what is still building on the first night', () => {
  expect(firstWeekItems([firstNightDay()], 0).map((i) => [i.term, remaining(i.progress)])).toEqual([
    ['readiness', 3],
    ['consistency', 1],
    ['normalRange', 4],
    ['skinTempChange', 3],
    ['stress', 3],
  ]);
  expect(readinessNightsLeft([firstNightDay()], 0)).toBe(3);
  const fixture = createFixtureDays(FIXTURE_NOW);
  expect(firstWeekItems(fixture, fixture.length - 1)).toEqual([]);
});

it.each([
  ['consistency', { have: 1, need: 2, unit: 'nights' }, '2026-11-28'],
  ['readiness', { have: 1, need: 4, unit: 'nights' }, '2026-11-30'],
  ['skinTempChange', { have: 1, need: 4, unit: 'nights' }, '2026-11-30'],
  ['normalRange', { have: 1, need: 5, unit: 'nights' }, '2026-12-01'],
  ['stress', { have: 0, need: 3, unit: 'days' }, '2026-11-30'],
] as const)('explains %s as needing more nights', (term, progress, day) => {
  expect(explainMissing(input(term, term === 'stress' ? 'low-coverage' : 'needs-history'))).toMatchObject({
    kind: 'needs-nights',
    current: true,
    band: { state: 'read' },
    progress,
    expectedDay: day,
  });
});

it('explains a finished day under ten hours', () => {
  const days = [firstNightDay({ day: '2026-11-26' }), firstNightDay()];
  expect(explainMissing(input('load', 'low-coverage', { days, index: 0 }))).toMatchObject({
    kind: 'day-running',
    wornMinutes: 482,
    current: false,
    expectedDay: null,
  });
});

it('maps the other reasons', () => {
  const noNight = firstNightDay({ sleep: { ...firstNightDay().sleep, periods: [] } });
  expect(explainMissing(input('hrv', 'no-sleep', { days: [noNight] }))).toMatchObject({
    kind: 'not-recorded',
    window: 'night',
    band: { state: 'no-window' },
  });
  expect(explainMissing(input('respiratoryRate', 'low-coverage'))).toMatchObject({ kind: 'thin-signal', progress: null });
  expect(explainMissing(input('calories', 'no-profile', { profileGaps: ['weight', 'birthYear'] }))).toMatchObject({
    kind: 'needs-profile',
    profileGaps: ['weight', 'birthYear'],
  });
  expect(explainMissing(input('load', 'missing-signal')).kind).toBe('signal-missing');
  expect(explainMissing(input('hrv', 'something-new')).kind).toBe('other');
});

it('never shows a check mark for a stale or missing sync', () => {
  expect(explainMissing(input('consistency', 'needs-history', { lastSyncAt: FIRST_NIGHT_NOW_S - 26 * 3600 })).band.state).toBe('stale');
  expect(explainMissing(input('consistency', 'needs-history', { lastSyncAt: null })).band.state).toBe('stale');
});

it('gives a past day no expected moment', () => {
  const days = [firstNightDay({ day: '2026-11-26' }), firstNightDay()];
  const expl = explainMissing(input('consistency', 'needs-history', { days, index: 0 }));
  expect(expl.expectedDay).toBeNull();
  expect(missingStatus(tEn, 'en', expl, 'row')).toBe('No number yet');
});

it('keeps at least one night left while readiness is hidden', () => {
  const usable = [0, 1, 2, 3].map((i) => firstNightDay({ day: `2026-11-2${4 + i}` }));
  expect(readinessNightsLeft(usable, 3)).toBe(1);
});

it('writes the consistency sheet', () => {
  const w = whyText(tEn, 'en', explainMissing(input('consistency', 'needs-history')));
  expect(w.subtitle).toBe('No number yet');
  expect(w.rows.map((r) => r.title)).toEqual(['Your band is being read', 'It needs more nights', 'Expected Saturday morning']);
  expect(w.rows.map((r) => r.body)).toEqual([
    'Synced 10:21. The night was recorded.',
    'It compares your bed and wake times over 2 nights. You have 1.',
    'If you wear the band tonight.',
  ]);
  expect(w.footer).toBe('Going to bed and getting up at similar times helps you sleep better, even when the hours stay the same.');
  expect(w.aboutLink).toBe('About Consistency ›');
});

it('writes counts, weekdays and Dutch correctly', () => {
  const skin = explainMissing(input('skinTempChange', 'needs-history'));
  expect(whyText(tEn, 'en', skin).rows[2]).toMatchObject({ title: 'Expected Monday morning', body: 'If you wear the band the next 3 nights.' });
  expect(whyText(tNl, 'nl', skin).rows[2]?.title).toBe('Verwacht maandagochtend');
  expect(missingStatus(tEn, 'en', skin, 'sheet')).toBe('No number until Monday');
  const consistency = explainMissing(input('consistency', 'needs-history'));
  expect(missingStatus(tEn, 'en', consistency, 'row')).toBe('1 more night');
  expect(missingStatus(tNl, 'nl', consistency, 'row')).toBe('Nog 1 nacht');
  expect(missingStatus(tEn, 'en', explainMissing(input('stress', 'low-coverage')), 'row')).toBe('3 more calm days');
});

it('writes the finished-day, not-recorded and stale sheets', () => {
  const days = [firstNightDay({ day: '2026-11-26' }), firstNightDay()];
  const load = explainMissing(input('load', 'low-coverage', { days, index: 0 }));
  expect(missingStatus(tEn, 'en', load, 'row')).toBe('Worn 8 h 2 min of 10 h');
  expect(whyText(tEn, 'en', load).rows[1]).toMatchObject({ body: 'Load needs 10 hours of heart rate in a day. This day had 8 h 2 min.' });
  expect(whyText(tEn, 'en', load).rows[1]?.bar).toBeCloseTo(482 / 600, 3);
  const noNight = firstNightDay({ sleep: { ...firstNightDay().sleep, periods: [] } });
  const nr = whyText(tEn, 'en', explainMissing(input('hrv', 'no-sleep', { days: [noNight] })));
  expect(nr.rows.map((r) => r.title)).toEqual(['No band data for the night', 'Nothing to work it out from', 'Next chance: tonight']);
  expect(nr.footer).toBe('OpenHoop never fills a gap with a guess. A night without data stays empty in your trends.');
  const stale = whyText(tEn, 'en', explainMissing(input('consistency', 'needs-history', { lastSyncAt: FIRST_NIGHT_NOW_S - 26 * 3600 })));
  expect(stale.rows[0]).toMatchObject({ title: 'Last sync 1 d ago', body: 'Sync the band to bring in your latest nights.' });
  const unknown = [firstNightDay({ day: '2026-11-26', loadValidMinutes: undefined }), firstNightDay()];
  expect(missingStatus(tEn, 'en', explainMissing(input('load', 'low-coverage', { days: unknown, index: 0 })), 'row')).toBe('Not enough readings');
});
