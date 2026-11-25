import { KNOWN_REASONS, allTranslations, reasonKey, reasonText, translate } from '@/i18n';

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
