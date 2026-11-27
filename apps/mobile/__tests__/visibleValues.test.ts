import { createFixtureDays } from '@/data/fixtureSource';
import { metricValue, shownLoad, visibleReadiness } from '@/data/derived';
import { buildDataSummary } from '@/coach/context';
import { translate } from '@/i18n';
import { digestFacts } from '@/lib/notificationPlan';
import { buildWidgetFile, parseWidgetFile, widgetView } from '@/lib/widgetSnapshot';
import { briefLines } from '@/ui/daily/briefText';

import { FIXTURE_NOW } from './support/appData';
import { FIRST_NIGHT_NOW_S, FIRST_NIGHT_SYNC_S, firstNightDay } from './support/firstNight';

const tEn: Parameters<typeof briefLines>[0] = (key, params) => translate('en', key, params);

it('hides readiness while calibrating and keeps a real missing reason', () => {
  expect(visibleReadiness(firstNightDay())).toMatchObject({ value: null, reason: 'needs-history' });
  expect(visibleReadiness(firstNightDay({ readiness: { value: null, reason: 'no-sleep', coverage: null, algo: 'x' } })).reason).toBe('no-sleep');
  const last = createFixtureDays(FIXTURE_NOW).at(-1);
  if (!last) throw new Error('no fixture');
  expect(visibleReadiness(last)).toBe(last.readiness);
  expect(metricValue(firstNightDay(), 'readiness')).toBeNull();
});
it('shows Load so far only on the open day', () => {
  expect(shownLoad([firstNightDay()], 0)).toEqual({ value: 4.6, soFar: true, reason: null });
  expect(shownLoad([firstNightDay({ day: '2026-11-26' }), firstNightDay()], 0)).toEqual({ value: null, soFar: false, reason: 'low-coverage' });
  expect(shownLoad([firstNightDay({ loadSoFar: undefined })], 0)).toEqual({ value: null, soFar: false, reason: 'low-coverage' });
});
it('says when readiness appears in the brief', () => {
  expect(briefLines(tEn, 'en', [firstNightDay()], 0).find((l) => l.id === 'readiness')?.text).toBe('Readiness appears after 3 more nights.');
});
it('leaves readiness out of the digest and the coach context while hidden', () => {
  expect(digestFacts([firstNightDay()], new Date(FIRST_NIGHT_NOW_S * 1000))('2026-11-27')?.readiness).toBeNull();
  expect(buildDataSummary([firstNightDay()], '2026-11-27')).toContain('2026-11-27 | - |');
});
it('writes nights left to the widget and reads old files', () => {
  const file = buildWidgetFile({ enabled: true, day: firstNightDay(), syncedAt: FIRST_NIGHT_SYNC_S, language: 'en', readinessNightsLeft: 3 });
  if (file.kind !== 'values') throw new Error('expected values');
  expect(file.readiness).toEqual({ value: null, reason: 'needs-history' });
  expect(file.nightsLeft).toBe(3);
  const ctx = { nowS: FIRST_NIGHT_NOW_S, today: '2026-11-27', fallbackLanguage: 'en' as const };
  const view = widgetView(file, ctx);
  if (view.kind !== 'values') throw new Error('expected values');
  expect(view.scores[0]).toMatchObject({ value: '–', note: '3 nights left', tone: 'muted' });
  const one = widgetView({ ...file, nightsLeft: 1 }, ctx);
  if (one.kind !== 'values') throw new Error('expected values');
  expect(one.scores[0]?.note).toBe('1 night left');
  const { nightsLeft: _drop, ...old } = file;
  const parsed = parseWidgetFile(JSON.stringify(old));
  expect(parsed?.kind === 'values' ? parsed.nightsLeft : 'x').toBeNull();
});
