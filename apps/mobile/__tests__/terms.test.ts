import { PARITY } from '@/ui/parity';
import { TERMS, TERM_IDS, isTermId, termFull, termLine } from '@/data/terms';
import { translate } from '@/i18n';
import { METRIC_SPECS } from '@/ui/daily/metrics';
import { CATALOGUE, VITALS } from '@/data/healthDerived';

it.each(TERM_IDS)('%s has every text in both languages', (id) => {
  const spec = TERMS[id];
  for (const key of [spec.name, spec.body, spec.method, termFull(id), termLine(id), ...(spec.short ? [spec.short] : [])])
    for (const lang of ['en', 'nl'] as const) expect(translate(lang, key).trim()).not.toBe('');
});
it('takes levels from PARITY and lists only where the canvas has them', () => {
  expect(TERMS.hrv.level).toBe(PARITY.hrv);
  expect(TERMS.normalRange.level).toBeNull();
  expect(TERM_IDS.filter((id) => TERMS[id].lists !== null)).toEqual(['hrv', 'restingHr', 'respiratoryRate', 'spo2', 'skinTemp', 'skinTempChange']);
});
it('uses the approved copy', () => {
  expect(translate('en', termLine('hrv'))).toBe('How much the time between heartbeats varies. Above your usual means rested.');
  expect(translate('en', TERMS.spo2.name)).toBe('Blood oxygen');
  expect(translate('nl', TERMS.spo2.name)).toBe('Bloedzuurstof');
  expect(translate('en', TERMS.hrv.lists?.[0].items ?? 'reason.unknown')).toBe('A long night\nA rest day\nA calm evening');
});
it('links every metric spec, vital and catalogue item to a valid term', () => {
  expect(Object.values(METRIC_SPECS).map((s) => s.term)).toEqual(['hrv', 'restingHr', 'respiratoryRate', 'spo2', 'skinTemp']);
  expect(VITALS.every((v) => isTermId(v.term))).toBe(true);
  expect(CATALOGUE.find((c) => c.id === 'tempDeviation')?.term).toBe('skinTempChange');
  expect(isTermId('bogus')).toBe(false);
});
