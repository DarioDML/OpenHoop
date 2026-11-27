import { createFixtureDays } from '@/data/fixtureSource';
import { buildWidgetFile, parseWidgetFile, ringSvg, serializeWidgetFile, widgetView, type WidgetFile, type WidgetValues } from '@/lib/widgetSnapshot';

import { FIXTURE_NOW } from './support/appData';

const days = createFixtureDays(FIXTURE_NOW);
const latest = days[days.length - 1];
const NOW_S = Math.floor(FIXTURE_NOW.getTime() / 1000);

function values(overrides: Partial<WidgetValues> = {}): WidgetValues {
  return {
    v: 1,
    kind: 'values',
    language: 'en',
    day: '2026-11-25',
    syncedAt: NOW_S - 2 * 3_600,
    readiness: { value: 72, reason: null },
    calibrating: false,
    nightsLeft: null,
    sleep: { value: 81, reason: null },
    load: { value: 12.4, reason: null },
    restingHr: { value: 52, reason: null },
    hrv: { value: 64, reason: null },
    loadTarget: null,
    ...overrides,
  };
}

describe('buildWidgetFile', () => {
  it('keeps only the displayed values of the latest day', () => {
    if (!latest) throw new Error('fixture has no days');
    const file = buildWidgetFile({ enabled: true, day: latest, syncedAt: NOW_S, language: 'nl', readinessNightsLeft: null });
    if (file.kind !== 'values') throw new Error('expected values');
    expect(Object.keys(file).sort()).toEqual(['calibrating', 'day', 'hrv', 'kind', 'language', 'load', 'loadTarget', 'nightsLeft', 'readiness', 'restingHr', 'sleep', 'syncedAt', 'v']);
    expect(file.day).toBe(latest.day);
    expect(file.readiness.value).toBe(latest.readiness.value === null ? null : Math.round(latest.readiness.value));
    expect(file.language).toBe('nl');
    const text = serializeWidgetFile(file);
    expect(text).not.toContain('samples');
    expect(text).not.toContain('periods');
    expect(text).not.toContain('deviceId');
  });

  it('stores a reason instead of a value and maps unknown reasons', () => {
    if (!latest) throw new Error('fixture has no days');
    const day = { ...latest, readiness: { ...latest.readiness, value: null, reason: 'needs-history' }, load: { ...latest.load, value: null, reason: 'something-new' } };
    const file = buildWidgetFile({ enabled: true, day, syncedAt: null, language: 'en', readinessNightsLeft: null });
    if (file.kind !== 'values') throw new Error('expected values');
    expect(file.readiness).toEqual({ value: null, reason: 'needs-history' });
    expect(file.load).toEqual({ value: null, reason: 'unknown' });
  });

  it('stores no values when turned off or when there is no day', () => {
    expect(buildWidgetFile({ enabled: false, day: latest, syncedAt: NOW_S, language: 'en', readinessNightsLeft: null })).toEqual({ v: 1, kind: 'off', language: 'en' });
    expect(buildWidgetFile({ enabled: true, day: undefined, syncedAt: NOW_S, language: 'nl', readinessNightsLeft: null })).toEqual({ v: 1, kind: 'empty', language: 'nl' });
  });
});

describe('parseWidgetFile', () => {
  it('round-trips every kind', () => {
    const files: WidgetFile[] = [values(), values({ readiness: { value: null, reason: 'no-sleep' }, syncedAt: null }), { v: 1, kind: 'off', language: 'nl' }, { v: 1, kind: 'empty', language: 'en' }];
    for (const file of files) expect(parseWidgetFile(serializeWidgetFile(file))).toEqual(file);
  });

  it('rejects anything malformed', () => {
    expect(parseWidgetFile(null)).toBeNull();
    expect(parseWidgetFile('not json')).toBeNull();
    expect(parseWidgetFile(JSON.stringify({ ...values(), v: 2 }))).toBeNull();
    expect(parseWidgetFile(JSON.stringify({ ...values(), language: 'de' }))).toBeNull();
    expect(parseWidgetFile(JSON.stringify({ ...values(), day: '25-11-2026' }))).toBeNull();
    expect(parseWidgetFile(JSON.stringify({ ...values(), readiness: { value: 250, reason: null } }))).toBeNull();
    expect(parseWidgetFile(JSON.stringify({ ...values(), hrv: { value: null, reason: 'made-up' } }))).toBeNull();
    expect(parseWidgetFile(JSON.stringify({ ...values(), load: { value: 5, reason: 'no-data' } }))).toBeNull();
    expect(parseWidgetFile(JSON.stringify({ ...values(), calibrating: 'yes' }))).toBeNull();
  });
});

describe('widgetView', () => {
  const context = { nowS: NOW_S, today: '2026-11-25', fallbackLanguage: 'en' as const };

  it('formats values in the stored language', () => {
    const view = widgetView(values({ language: 'nl' }), context);
    if (view.kind !== 'values') throw new Error('expected values');
    expect(view.scores.map((line) => [line.label, line.value])).toEqual([
      ['Paraatheid', '72%'],
      ['Slaapscore', '81%'],
      ['Belasting', '12,4'],
    ]);
    expect(view.vitals.map((line) => line.value)).toEqual(['52 bpm', '64 ms']);
    expect(view.scores[0].tone).toBe('readinessHigh');
    expect(view.age).toBe('Gesynchroniseerd 2 u geleden');
    expect(view.stale).toBe(false);
  });

  it('shows the reason when a value is missing', () => {
    const view = widgetView(values({ sleep: { value: null, reason: 'no-sleep' }, hrv: { value: null, reason: 'low-coverage' } }), context);
    if (view.kind !== 'values') throw new Error('expected values');
    expect(view.scores[1]).toMatchObject({ value: '–', note: 'No sleep recorded', tone: 'muted' });
    expect(view.vitals[1]).toMatchObject({ value: '–', note: 'Not enough readings' });
  });

  it('hides a calibrating readiness and keeps it neutral', () => {
    const view = widgetView(values({ calibrating: true }), context);
    if (view.kind !== 'values') throw new Error('expected values');
    expect(view.scores[0]).toMatchObject({ value: '–', note: 'Needs more nights first', tone: 'muted' });
  });

  it('marks old snapshots with their day and age', () => {
    const view = widgetView(values({ day: '2026-11-23', syncedAt: NOW_S - 2 * 86_400 }), context);
    if (view.kind !== 'values') throw new Error('expected values');
    expect(view.age).toBe('From 11/23 · Synced 2 d ago');
    expect(view.stale).toBe(true);
    const neverSynced = widgetView(values({ syncedAt: null }), context);
    expect(neverSynced.kind === 'values' && neverSynced.stale).toBe(true);
  });

  it('shows a message without values when off, empty or missing', () => {
    expect(widgetView({ v: 1, kind: 'off', language: 'en' }, context)).toMatchObject({ kind: 'message', title: 'Values are off' });
    expect(widgetView({ v: 1, kind: 'empty', language: 'nl' }, context)).toMatchObject({ kind: 'message', title: 'Nog geen data' });
    expect(widgetView(null, { ...context, fallbackLanguage: 'nl' })).toMatchObject({ kind: 'message', title: 'Nog geen scores' });
  });
});

describe('widget extras', () => {
  const context = { nowS: NOW_S, today: '2026-11-25', fallbackLanguage: 'en' as const };

  it('keeps a valid load target and rejects a broken one', () => {
    if (!latest) throw new Error('fixture has no days');
    const file = buildWidgetFile({ enabled: true, day: latest, syncedAt: NOW_S, language: 'en', readinessNightsLeft: null, loadTarget: { low: 7.64, high: 15.61 } });
    if (file.kind !== 'values') throw new Error('expected values');
    expect(file.loadTarget).toEqual({ low: 7.6, high: 15.6 });
    expect(parseWidgetFile(serializeWidgetFile(file))).toEqual(file);
    expect(parseWidgetFile(JSON.stringify({ ...values(), loadTarget: { low: 9, high: 3 } }))).toBeNull();
    const { loadTarget: _dropped, ...older } = values();
    expect(parseWidgetFile(JSON.stringify(older))).toEqual(values());
  });

  it('writes a headline, a load line and ring fractions', () => {
    const view = widgetView(values({ loadTarget: { low: 7.6, high: 15.6 } }), context);
    if (view.kind !== 'values') throw new Error('expected values');
    expect(view.headline).toBe('Ready for more');
    expect(view.loadLine).toBe('Load 12.4 of 7.6–15.6');
    expect(view.scores.map((line) => line.fraction)).toEqual([0.72, 0.81, 12.4 / 21]);
    const calibrating = widgetView(values({ calibrating: true }), context);
    if (calibrating.kind !== 'values') throw new Error('expected values');
    expect(calibrating.headline).toBe('No readiness yet');
    expect(calibrating.loadLine).toBe('Load 12.4');
    expect(calibrating.scores[0].fraction).toBeNull();
  });

  it('draws a ring as SVG with an arc only when there is a value', () => {
    expect(ringSvg(0.5, '#FF0000', '#333333')).toContain('stroke-dasharray');
    expect(ringSvg(null, '#FF0000', '#333333')).not.toContain('stroke-dasharray');
    expect(ringSvg(2, '#FF0000', '#333333')).toContain(`stroke-dasharray="${(2 * Math.PI * 29).toFixed(2)} `);
  });
});
