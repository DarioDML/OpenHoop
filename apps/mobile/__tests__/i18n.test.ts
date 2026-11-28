import { KNOWN_REASONS, allTranslations, countKey, reasonKey, reasonText, translate } from '@/i18n';
import { needReasonKey } from '@/ui/sleep/needReason';

const { en, nl } = allTranslations;

describe('translation files', () => {
  it('have identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(nl).sort());
  });

  it('have no empty values and matching placeholders', () => {
    const placeholders = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(nl)) {
      const nlText = nl[key] ?? '';
      const enText = en[key] ?? '';
      expect(nlText.trim()).not.toBe('');
      expect(enText.trim()).not.toBe('');
      expect(placeholders(enText)).toEqual(placeholders(nlText));
    }
  });

  it('interpolates parameters', () => {
    expect(translate('nl', 'band.backlogPages', { count: 3 })).toBe("3 pagina's");
    expect(translate('en', 'band.backlogPages', { count: 3 })).toBe('3 pages');
  });
});

describe('reason-to-text mapping', () => {
  const expected: Record<(typeof KNOWN_REASONS)[number], { nl: string; en: string }> = {
    'no-data': { nl: 'Geen data', en: 'No data' },
    'low-coverage': { nl: 'Te weinig meetdata', en: 'Not enough readings' },
    'no-sleep': { nl: 'Geen slaap vastgelegd', en: 'No sleep recorded' },
    'missing-signal': { nl: 'Signaal ontbreekt', en: 'Signal missing' },
    'needs-history': { nl: 'Eerst meer nachten nodig', en: 'Needs more nights first' },
    'no-profile': { nl: 'Lichaamsprofiel onvolledig', en: 'Body profile incomplete' },
  };

  it.each(KNOWN_REASONS)('maps %s in both languages', (reason) => {
    expect(reasonText('nl', reason)).toBe(expected[reason].nl);
    expect(reasonText('en', reason)).toBe(expected[reason].en);
  });

  it('covers every known reason with a distinct key', () => {
    const keys = KNOWN_REASONS.map((r) => reasonKey(r));
    expect(new Set(keys).size).toBe(KNOWN_REASONS.length);
  });

  it('falls back for null and unknown reasons without leaking the raw code', () => {
    expect(reasonText('en', null)).toBe('No data');
    expect(reasonText('nl', 'something-new')).toBe('Geen waarde beschikbaar');
  });
});

describe('countKey', () => {
  it('picks the singular text only for exactly one', () => {
    expect(translate('en', countKey(1, 'stage.trendNightsOne', 'stage.trendNights'), { count: 1 })).toBe('1 night');
    expect(translate('nl', countKey(1, 'stage.trendNightsOne', 'stage.trendNights'), { count: 1 })).toBe('1 nacht');
    expect(translate('en', countKey(0, 'stage.trendNightsOne', 'stage.trendNights'), { count: 0 })).toBe('0 nights');
    expect(translate('en', countKey(5, 'sleepx.typicalNeedHintOne', 'sleepx.typicalNeedHint'), { count: 5 })).toBe('Average over the 5 nights before today');
    expect(translate('en', countKey(1, 'sleepx.typicalNeedHintOne', 'sleepx.typicalNeedHint'), { count: 1 })).not.toMatch(/1 nights/);
  });
});

describe('remaining count texts', () => {
  it('reads singular for one', () => {
    expect(translate('en', countKey(1, 'metricDetail.baselineNightsOne', 'metricDetail.baselineNights'), { count: 1 })).toBe('From 1 night');
    expect(translate('nl', countKey(1, 'explain.rangeAfterOne', 'explain.rangeAfter'), { count: 1 })).toBe('Je gewone bereik verschijnt na 1 nacht');
    expect(translate('en', countKey(1, 'profile.ach.workoutsOne', 'profile.ach.workouts'), { count: 1 })).toBe('1 workout recorded');
    expect(translate('en', countKey(4, 'explain.rangeAfterOne', 'explain.rangeAfter'), { count: 4 })).toBe('Your usual range shows after 4 nights');
  });
});

describe('needReasonKey', () => {
  it('says a missing sleep need waits for a recorded night', () => {
    expect(translate('en', needReasonKey('no-sleep'))).toBe('Known after a recorded night');
    expect(translate('nl', needReasonKey('no-sleep'))).toBe('Bekend na een gemeten nacht');
  });

  it('keeps the general reason for every other cause', () => {
    expect(needReasonKey('needs-history')).toBe(reasonKey('needs-history'));
    expect(needReasonKey(null)).toBe(reasonKey(null));
  });
});
