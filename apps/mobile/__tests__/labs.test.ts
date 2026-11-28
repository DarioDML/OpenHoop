import type { LabResult } from '@openhoop/core';

import {
  BIOMARKER_IDS,
  BIOMARKER_UNITS,
  buildHistory,
  convertLabValue,
  customKey,
  draftFromResult,
  emptyLabDraft,
  formatConverted,
  formatEntered,
  groupKey,
  parseBiomarkerKey,
  rangeStatus,
  summarizeBiomarkers,
  validateLabDraft,
  type LabDraft,
} from '@/data/labs';

const TODAY = '2026-11-25';

function result(id: number, patch: Partial<LabResult> = {}): LabResult {
  return {
    id,
    biomarker: 'glucose',
    unit: 'mmol/L',
    value: 5,
    day: '2026-11-01',
    refLow: null,
    refHigh: null,
    note: null,
    createdAt: id,
    ...patch,
  };
}

function draft(patch: Partial<LabDraft> = {}): LabDraft {
  return { ...emptyLabDraft(TODAY, 'glucose'), value: '5,2', ...patch };
}

describe('unit conversion', () => {
  const glucose = parseBiomarkerKey('glucose');

  it('converts glucose between mmol/L and mg/dL', () => {
    expect(convertLabValue(5, 'mmol/L', 'mg/dL', glucose)).toBeCloseTo(90.08, 2);
    expect(convertLabValue(90, 'mg/dL', 'mmol/L', glucose)).toBeCloseTo(4.996, 2);
  });

  it('converts cholesterol and triglycerides with their own factors', () => {
    expect(convertLabValue(5, 'mmol/L', 'mg/dL', parseBiomarkerKey('ldl'))).toBeCloseTo(193.35, 2);
    expect(convertLabValue(1.7, 'mmol/L', 'mg/dL', parseBiomarkerKey('triglycerides'))).toBeCloseTo(150.57, 2);
  });

  it('converts HbA1c between % and mmol/mol, offset included', () => {
    const hba1c = parseBiomarkerKey('hba1c');
    expect(convertLabValue(6.5, '%', 'mmol/mol', hba1c)).toBeCloseTo(47.55, 1);
    expect(convertLabValue(48, 'mmol/mol', '%', hba1c)).toBeCloseTo(6.54, 2);
  });

  it('round-trips every unit of every catalogue biomarker', () => {
    for (const id of BIOMARKER_IDS) {
      const ref = parseBiomarkerKey(id);
      const units = BIOMARKER_UNITS[id].map((u) => u.label);
      for (const from of units) {
        for (const to of units) {
          const there = convertLabValue(12.5, from, to, ref);
          expect(there).not.toBeNull();
          expect(convertLabValue(there ?? 0, to, from, ref)).toBeCloseTo(12.5, 8);
        }
      }
    }
  });

  it('refuses units that do not belong to the biomarker and custom biomarkers', () => {
    expect(convertLabValue(5, 'mmol/L', 'ng/mL', glucose)).toBeNull();
    expect(convertLabValue(5, 'foo', 'bar', parseBiomarkerKey(customKey('Zinc')))).toBeNull();
    expect(convertLabValue(5, 'foo', 'foo', parseBiomarkerKey(customKey('Zinc')))).toBe(5);
  });
});

describe('range status', () => {
  it('is neutral when no range was entered', () => {
    expect(rangeStatus({ value: 5, refLow: null, refHigh: null })).toBeNull();
  });

  it('compares against the range the user typed, boundaries included', () => {
    const range = { refLow: 3.9, refHigh: 5.6 };
    expect(rangeStatus({ value: 3.9, ...range })).toBe('inside');
    expect(rangeStatus({ value: 5.6, ...range })).toBe('inside');
    expect(rangeStatus({ value: 3.8, ...range })).toBe('outside');
    expect(rangeStatus({ value: 5.7, ...range })).toBe('outside');
  });

  it('handles one-sided ranges', () => {
    expect(rangeStatus({ value: 1, refLow: 2, refHigh: null })).toBe('outside');
    expect(rangeStatus({ value: 3, refLow: 2, refHigh: null })).toBe('inside');
    expect(rangeStatus({ value: 3, refLow: null, refHigh: 2 })).toBe('outside');
    expect(rangeStatus({ value: 1, refLow: null, refHigh: 2 })).toBe('inside');
  });
});

describe('validateLabDraft', () => {
  it('accepts a catalogue entry and parses a decimal comma', () => {
    const outcome = validateLabDraft(draft({ refLow: '3,9', refHigh: '5.6', note: ' fasting ' }), TODAY);
    expect(outcome).toEqual({
      ok: true,
      value: { biomarker: 'glucose', unit: 'mmol/L', value: 5.2, day: TODAY, refLow: 3.9, refHigh: 5.6, note: 'fasting' },
    });
  });

  it('stores optional fields as null', () => {
    const outcome = validateLabDraft(draft(), TODAY);
    expect(outcome.ok && outcome.value).toMatchObject({ refLow: null, refHigh: null, note: null });
  });

  it('accepts a custom biomarker with its own unit', () => {
    const outcome = validateLabDraft(draft({ biomarker: 'custom', customName: '  Vitamin   B12 ', unit: 'pmol/L' }), TODAY);
    expect(outcome.ok && outcome.value).toMatchObject({ biomarker: 'custom:Vitamin B12', unit: 'pmol/L' });
  });

  it.each(['', 'abc', 'NaN', 'Infinity', '1e5', '-1', '1.23456', '1000001', '5 6'])('rejects the value %p', (value) => {
    const outcome = validateLabDraft(draft({ value }), TODAY);
    expect(outcome).toEqual({ ok: false, invalid: ['value'] });
  });

  it('accepts zero and the upper limit', () => {
    expect(validateLabDraft(draft({ value: '0' }), TODAY).ok).toBe(true);
    expect(validateLabDraft(draft({ value: '1000000' }), TODAY).ok).toBe(true);
  });

  it('rejects a unit that does not belong to the catalogue biomarker', () => {
    expect(validateLabDraft(draft({ unit: 'ng/mL' }), TODAY)).toEqual({ ok: false, invalid: ['unit'] });
    expect(validateLabDraft(draft({ unit: '' }), TODAY)).toEqual({ ok: false, invalid: ['unit'] });
  });

  it('requires a biomarker, a custom name and a custom unit', () => {
    expect(validateLabDraft(draft({ biomarker: '' }), TODAY)).toEqual({ ok: false, invalid: ['biomarker'] });
    expect(validateLabDraft(draft({ biomarker: 'unknown' }), TODAY)).toEqual({ ok: false, invalid: ['biomarker'] });
    expect(validateLabDraft(draft({ biomarker: 'custom', customName: '   ', unit: 'x' }), TODAY)).toEqual({ ok: false, invalid: ['biomarker'] });
    expect(validateLabDraft(draft({ biomarker: 'custom', customName: 'Zinc', unit: ' ' }), TODAY)).toEqual({ ok: false, invalid: ['unit'] });
    expect(validateLabDraft(draft({ biomarker: 'custom', customName: 'x'.repeat(61), unit: 'u' }), TODAY).ok).toBe(false);
    expect(validateLabDraft(draft({ biomarker: 'custom', customName: 'Zi\u0000nc', unit: 'u' }), TODAY).ok).toBe(false);
  });

  it('rejects dates in the future, impossible dates and other formats', () => {
    expect(validateLabDraft(draft({ day: '2026-11-26' }), TODAY)).toEqual({ ok: false, invalid: ['day'] });
    expect(validateLabDraft(draft({ day: '2026-02-30' }), TODAY)).toEqual({ ok: false, invalid: ['day'] });
    expect(validateLabDraft(draft({ day: '25-11-2026' }), TODAY)).toEqual({ ok: false, invalid: ['day'] });
    expect(validateLabDraft(draft({ day: '1999-01-01' }), TODAY)).toEqual({ ok: false, invalid: ['day'] });
    expect(validateLabDraft(draft({ day: TODAY }), TODAY).ok).toBe(true);
  });

  it('requires low to be below high when both are entered', () => {
    expect(validateLabDraft(draft({ refLow: '6', refHigh: '5' }), TODAY)).toEqual({ ok: false, invalid: ['refLow', 'refHigh'] });
    expect(validateLabDraft(draft({ refLow: '5', refHigh: '5' }), TODAY)).toEqual({ ok: false, invalid: ['refLow', 'refHigh'] });
    expect(validateLabDraft(draft({ refLow: '5' }), TODAY).ok).toBe(true);
    expect(validateLabDraft(draft({ refHigh: '5' }), TODAY).ok).toBe(true);
  });

  it('rejects malformed range values and over-long notes', () => {
    expect(validateLabDraft(draft({ refLow: 'x' }), TODAY)).toEqual({ ok: false, invalid: ['refLow'] });
    expect(validateLabDraft(draft({ refHigh: '-2' }), TODAY)).toEqual({ ok: false, invalid: ['refHigh'] });
    expect(validateLabDraft(draft({ note: 'n'.repeat(301) }), TODAY)).toEqual({ ok: false, invalid: ['note'] });
  });

  it('keeps line breaks in a note but rejects other control characters', () => {
    const multiline = validateLabDraft(draft({ note: 'Fasting\nDrawn at 8am' }), TODAY);
    expect(multiline.ok && multiline.value.note).toBe('Fasting\nDrawn at 8am');
    expect(validateLabDraft(draft({ note: 'a\u0000b' }), TODAY)).toEqual({ ok: false, invalid: ['note'] });
  });

  it('collects every invalid field at once', () => {
    const outcome = validateLabDraft(draft({ value: '', day: 'x', refLow: 'y' }), TODAY);
    expect(outcome).toEqual({ ok: false, invalid: ['value', 'day', 'refLow'] });
  });

  it('round-trips a stored result through the draft', () => {
    const stored = result(1, { biomarker: 'custom:Zinc', unit: 'umol/L', value: 12.5, refLow: 10, refHigh: 18, note: 'n' });
    const outcome = validateLabDraft(draftFromResult(stored), TODAY);
    expect(outcome.ok && outcome.value).toEqual({
      biomarker: 'custom:Zinc',
      unit: 'umol/L',
      value: 12.5,
      day: '2026-11-01',
      refLow: 10,
      refHigh: 18,
      note: 'n',
    });
  });
});

describe('summaries and history', () => {
  it('keeps the latest result per biomarker, catalogue first, customs grouped case-insensitively', () => {
    const results = [
      result(1, { biomarker: 'custom:zinc', unit: 'u', day: '2026-01-01' }),
      result(2, { biomarker: 'ldl', day: '2026-02-01' }),
      result(3, { biomarker: 'glucose', value: 5.1, day: '2026-03-01' }),
      result(4, { biomarker: 'glucose', value: 6.2, day: '2026-05-01' }),
      result(5, { biomarker: 'custom:Zinc', unit: 'u', value: 9, day: '2026-06-01' }),
    ];
    const summaries = summarizeBiomarkers(results);
    expect(summaries.map((s) => s.group)).toEqual(['glucose', 'ldl', 'custom:zinc']);
    expect(summaries[0]?.latest.value).toBe(6.2);
    expect(summaries[0]?.count).toBe(2);
    expect(summaries[2]?.latest.value).toBe(9);
    expect(summaries[2]?.key).toBe('custom:Zinc');
  });

  it('groups custom names regardless of case and keeps catalogue ids exact', () => {
    expect(groupKey('custom:Zinc')).toBe(groupKey('custom:zinc'));
    expect(groupKey('vitaminD')).toBe('vitaminD');
  });

  it('charts in the chosen unit and takes the band from the newest entry with a full range', () => {
    const entries = [
      result(1, { value: 90, unit: 'mg/dL', day: '2026-01-01', refLow: 70, refHigh: 100 }),
      result(2, { value: 5.5, unit: 'mmol/L', day: '2026-02-01' }),
    ];
    const mmol = buildHistory(entries, null);
    expect(mmol?.unit).toBe('mmol/L');
    expect(mmol?.points[0]?.value).toBeCloseTo(4.996, 2);
    expect(mmol?.points[1]?.value).toBe(5.5);
    expect(mmol?.band?.low).toBeCloseTo(3.885, 2);
    expect(mmol?.band?.high).toBeCloseTo(5.55, 2);
    expect(mmol?.bandFrom?.id).toBe(1);
    const mg = buildHistory(entries, 'mg/dL');
    expect(mg?.points[0]?.value).toBe(90);
    expect(mg?.points[1]?.value).toBeCloseTo(99.1, 1);
    expect(mg?.band).toEqual({ low: 70, high: 100 });
  });

  it('keeps a one-sided range from the newest entry that has one', () => {
    const history = buildHistory([result(1, { refLow: 3, refHigh: 6 }), result(2, { refHigh: 6, day: '2026-11-05' })], null);
    expect(history?.band).toEqual({ low: null, high: 6 });
    expect(history?.bandFrom?.id).toBe(2);
    const atLeast = buildHistory([result(3, { refLow: 3 })], 'mg/dL');
    expect(atLeast?.band?.low).toBeCloseTo(54, 0);
    expect(atLeast?.band?.high).toBeNull();
  });

  it('has no band when no entry has a range', () => {
    const history = buildHistory([result(1), result(2, { day: '2026-11-05' })], null);
    expect(history?.band).toBeNull();
    expect(history?.bandFrom).toBeNull();
  });

  it('only charts custom results that share the chosen unit', () => {
    const entries = [
      result(1, { biomarker: 'custom:Zinc', unit: 'a', day: '2026-01-01' }),
      result(2, { biomarker: 'custom:Zinc', unit: 'b', day: '2026-02-01', value: 7 }),
    ];
    const history = buildHistory(entries, null);
    expect(history?.units).toEqual(['b', 'a']);
    expect(history?.unit).toBe('b');
    expect(history?.points.map((p) => p.result.id)).toEqual([2]);
    expect(buildHistory([], null)).toBeNull();
  });
});

describe('number formatting', () => {
  it('shows entered values as typed and converted values to 4 significant digits', () => {
    expect(formatEntered(5.2, 'en')).toBe('5.2');
    expect(formatEntered(5.2, 'nl')).toBe('5,2');
    expect(formatEntered(1234.5678, 'en')).toBe('1234.5678');
    expect(formatConverted(93.6746, 'en')).toBe('93.67');
    expect(formatConverted(93.6746, 'nl')).toBe('93,67');
  });
});
