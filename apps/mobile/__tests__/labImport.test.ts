import { BIOMARKER_IDS, validateLabDraft } from '@/data/labs';
import { BIOMARKER_ALIASES, matchBiomarker } from '@/data/labImport/aliases';
import { findDate, findReportDay, parseLabText, parseRange, parseResultLine, type LabCandidate } from '@/data/labImport/parse';
import { remapRow, rowsFromCandidates, sharedDay, validateSelected, withDay } from '@/data/labImport/review';
import { assembleRows, readNativeText, textLines, type OcrLine } from '@/data/labImport/rows';
import { normalizeUnit, printedUnit } from '@/data/labImport/units';

const TODAY = '2026-11-25';

const BELGIAN_PDF = `Algemeen Medisch Laboratorium
Patiënt: Jansen Jan   Geboortedatum: 03/04/1980
Datum staalname: 18/11/2026 08:12
Datum afdruk: 19/11/2026
Analyse Resultaat Eenheid Referentiewaarden
HEMATOLOGIE
Hemoglobine 14,2 g/dL 13,0 - 17,0
Hematocriet 42,1 % 40,0 - 50,0
Leukocyten 6,8 10^3/µL 4,0 - 10,0
CHEMIE
Glucose nuchter 92 mg/dL 70 - 99
HbA1c (IFCC) 38 mmol/mol 20 - 42
HbA1c (DCCT) 5,6 % 4,0 - 6,0
Cholesterol totaal 212 H mg/dL < 190
HDL-cholesterol 58 mg/dL > 40
LDL-cholesterol (berekend) 128 H mg/dL < 115
Triglyceriden 132 mg/dL < 150
Ferritine 45 µg/L 30 - 400
25-OH vitamine D 28,5 L ng/mL 30 - 100
TSH 1,85 mU/L 0,27 - 4,20
CRP <0,5 mg/L < 5,0
Creatinine 0,98 mg/dL 0,70 - 1,20
Telefoon 09 123 45 67
Pagina 1 van 2`.split('\n');

const ENGLISH_PDF = `City Hospital Pathology
Patient DOB: 01/02/1975   Printed: 20 Nov 2026
Collected: 12 Nov 2026 07:45
Test Result Flag Units Reference Interval
Glucose, Fasting 5.4 mmol/L 3.9-5.5
Hemoglobin A1c 5.9 H % 4.8-5.6
Cholesterol, Total 5.8 H mmol/L <5.2
LDL Cholesterol Calc 3.6 H mmol/L <3.4
HDL Cholesterol 1.3 mmol/L >1.0
Triglycerides 1.9 H mmol/L <1.7
Ferritin 120 ng/mL 30-400
Vitamin D, 25-Hydroxy 32 ng/mL 30-100
TSH 2.10 uIU/mL 0.45-4.50
C-Reactive Protein 3.2 mg/L <5.0
Hemoglobin 13.9 g/dL 13.0-17.7
Comment: results reviewed by Dr Smith on 13/11/2026`.split('\n');

const OCR_NOISY = `Laboratorium Medisch Centrum
Afname datum
14-11-2026
Glucose nuchter 5,2 mmol/I 3,9 - 5,5
HbAlc 5.6 % 4,0-6,0
Ferritine 45 ug/l 30-400
TSH l,85 mU/L 0,27-4,20
LDL-cholesterol (berekend) * 128 mg/dL <115
CRP < 0.5 mg / L < 5
Vitamine D 3O,1 ng/ml 30 - 100
Hb 8,9 mmol/l 8,5-11,0
Vitamine B12 350 pmol/L 150-650`.split('\n');

function find(candidates: readonly LabCandidate[], name: string): LabCandidate | undefined {
  return candidates.find((candidate) => candidate.name === name);
}

describe('unit normalisation', () => {
  it.each([
    ['mmol/l', 'mmol/L'],
    ['mmol/I', 'mmol/L'],
    ['MG/DL', 'mg/dL'],
    ['mg/dI', 'mg/dL'],
    ['ug/l', 'µg/L'],
    ['μg/L', 'µg/L'],
    ['µg/L', 'µg/L'],
    ['mU/L', 'mIU/L'],
    ['mE/l', 'mIU/L'],
    ['uIU/mL', 'µIU/mL'],
    ['mg / L', 'mg/L'],
    ['g/l', 'g/L'],
    ['%', '%'],
    ['ng/ml', 'ng/mL'],
    ['nmol/L', 'nmol/L'],
  ])('reads %s as %s', (raw, label) => {
    expect(normalizeUnit(raw)).toBe(label);
  });

  it('does not guess unknown units', () => {
    expect(normalizeUnit('U/L')).toBeNull();
    expect(normalizeUnit('10^9/L')).toBeNull();
    expect(normalizeUnit('')).toBeNull();
  });

  it('keeps a printed unit for unmatched rows only when it looks like one', () => {
    expect(printedUnit('10^9/L')).toBe('10^9/L');
    expect(printedUnit('U/L')).toBe('U/L');
    expect(printedUnit('van')).toBeNull();
    expect(printedUnit('12/11/2026')).toBeNull();
    expect(printedUnit('<script>/x')).toBeNull();
  });
});

describe('biomarker aliases', () => {
  it.each([
    ['Glucose nuchter', 'glucose'],
    ['S-Glucose', 'glucose'],
    ['Glucose, Fasting', 'glucose'],
    ['HbA1c', 'hba1c'],
    ['HbA1c (IFCC)', 'hba1c'],
    ['Hemoglobin A1c', 'hba1c'],
    ['LDL-cholesterol (berekend)', 'ldl'],
    ['LDL Cholesterol Calc', 'ldl'],
    ['Cholesterol HDL', 'hdl'],
    ['Cholesterol totaal', 'totalCholesterol'],
    ['Ferritine', 'ferritin'],
    ['25-OH vitamine D', 'vitaminD'],
    ['Vitamine D (25-OH)', 'vitaminD'],
    ['Vitamin D, 25-Hydroxy', 'vitaminD'],
    ['TSH', 'tsh'],
    ['TSH (3e generatie)', 'tsh'],
    ['CRP', 'crp'],
    ['hs-CRP', 'crp'],
    ['C-reactief proteïne', 'crp'],
    ['Hemoglobine', 'haemoglobin'],
    ['Triglyceriden', 'triglycerides'],
  ])('matches %s to %s', (printed, id) => {
    expect(matchBiomarker(printed)).toBe(id);
  });

  it.each(['Cholesterol/HDL ratio', 'Non-HDL cholesterol', 'U-Glucose', 'Glucose urine', 'Vitamine B12', 'Hematocriet', 'Uw glucose', 'LDL/HDL'])(
    'does not guess for %s',
    (printed) => {
      expect(matchBiomarker(printed)).toBeNull();
    },
  );

  it('only has aliases for catalogue ids', () => {
    for (const id of Object.keys(BIOMARKER_ALIASES)) expect(BIOMARKER_IDS).toContain(id);
  });
});

describe('reference ranges', () => {
  it('reads low - high, upper and lower bounds', () => {
    expect(parseRange('3,9 - 5,5')).toEqual({ refLow: 3.9, refHigh: 5.5 });
    expect(parseRange('3.9-5.5')).toEqual({ refLow: 3.9, refHigh: 5.5 });
    expect(parseRange('70 tot 99')).toEqual({ refLow: 70, refHigh: 99 });
    expect(parseRange('< 5.0')).toEqual({ refLow: null, refHigh: 5 });
    expect(parseRange('<=5')).toEqual({ refLow: null, refHigh: 5 });
    expect(parseRange('> 1.0')).toEqual({ refLow: 1, refHigh: null });
    expect(parseRange('')).toEqual({ refLow: null, refHigh: null });
  });

  it('drops a range whose low is not below its high', () => {
    expect(parseRange('5.5 - 3.9')).toEqual({ refLow: null, refHigh: null });
  });
});

describe('result lines', () => {
  it('reads a value glued to its unit and a separate comparator', () => {
    expect(parseResultLine('Glucose 5.2mmol/L 3.9-5.5')).toEqual({
      name: 'Glucose',
      biomarker: 'glucose',
      value: 5.2,
      censored: null,
      unit: 'mmol/L',
      refLow: 3.9,
      refHigh: 5.5,
    });
    expect(parseResultLine('CRP < 0,5 mg/L')).toMatchObject({ biomarker: 'crp', value: 0.5, censored: '<' });
    expect(parseResultLine('TSH 1.85 0.27-4.20 mIU/L')).toMatchObject({ biomarker: 'tsh', value: 1.85, refLow: 0.27, refHigh: 4.2 });
  });

  it('ignores lines without a value or without a unit', () => {
    expect(parseResultLine('HEMATOLOGIE')).toBeNull();
    expect(parseResultLine('Pagina 1 van 2')).toBeNull();
    expect(parseResultLine('HbA1c 5.6')).toBeNull();
    expect(parseResultLine('Datum staalname: 18/11/2026 08:12')).toBeNull();
    expect(parseResultLine('12 3.4 mmol/L')).toBeNull();
  });

  it('keeps a recognised name with a unit that does not fit as an unmatched row', () => {
    expect(parseResultLine('Hb 8,9 mmol/l 8,5-11,0')).toMatchObject({ name: 'Hb', biomarker: null, unit: 'mmol/L', value: 8.9 });
  });

  it('never takes a number from the name or the range as the value', () => {
    expect(parseResultLine('Vitamine D (25 OH) 75 nmol/L 50 - 125')).toMatchObject({ biomarker: 'vitaminD', value: 75, unit: 'nmol/L', refLow: 50, refHigh: 125 });
    expect(parseResultLine('Vitamine D 25(OH) 75 nmol/L')).toMatchObject({ biomarker: 'vitaminD', value: 75 });
    expect(parseResultLine('Glucose 3.9 - 6.1 mmol/L')).toBeNull();
    expect(parseResultLine('Glucose 3,9 tot 6,1 mmol/L')).toBeNull();
    expect(parseResultLine('Glucose 5 4 mmol/L')).toMatchObject({ biomarker: null, value: 4 });
  });

  it('skips long prose lines that are not in the catalogue', () => {
    expect(parseResultLine('Your result was within the usual limits of 5.0 mmol/L for most people')).toBeNull();
  });
});

describe('report dates', () => {
  it('reads day-first, ISO and month-name dates', () => {
    expect(findDate('18/11/2026', TODAY)).toBe('2026-11-18');
    expect(findDate('18.11.26', TODAY)).toBe('2026-11-18');
    expect(findDate('2026-11-18', TODAY)).toBe('2026-11-18');
    expect(findDate('12 Nov 2026', TODAY)).toBe('2026-11-12');
    expect(findDate('3 maart 2026', TODAY)).toBe('2026-03-03');
  });

  it('refuses impossible, future and very old dates', () => {
    expect(findDate('31/02/2026', TODAY)).toBeNull();
    expect(findDate('01/12/2026', TODAY)).toBeNull();
    expect(findDate('01/01/1999', TODAY)).toBeNull();
  });

  it('reads the date after the sample keyword on a shared header line', () => {
    expect(findReportDay(['Geboortedatum: 05/06/2001   Datum staalname: 18/11/2026'], TODAY)).toBe('2026-11-18');
    expect(findReportDay(['Datum afdruk 19/11/2026  Afname 18/11/2026'], TODAY)).toBe('2026-11-18');
    expect(findReportDay(['Afname 18/11/2026 Datum afdruk 19/11/2026'], TODAY)).toBe('2026-11-18');
    expect(findReportDay(['Geb. 03/04/80 Afname 18/11/26'], TODAY)).toBe('2026-11-18');
    expect(findReportDay(['Afname', 'Geboortedatum 05/06/2001'], TODAY)).toBeNull();
  });

  it('prefers the sample date over the print date and date of birth', () => {
    expect(findReportDay(BELGIAN_PDF, TODAY)).toBe('2026-11-18');
    expect(findReportDay(ENGLISH_PDF, TODAY)).toBe('2026-11-12');
    expect(findReportDay(OCR_NOISY, TODAY)).toBe('2026-11-14');
    expect(findReportDay(['Geboortedatum 03/04/1980', 'Datum afdruk 19/11/2026'], TODAY)).toBeNull();
  });
});

describe('lab report text', () => {
  it('reads a Belgian PDF text layer', () => {
    const { candidates, day } = parseLabText(BELGIAN_PDF, TODAY);
    expect(day).toBe('2026-11-18');
    const matched = candidates.filter((c) => c.biomarker !== null).map((c) => [c.biomarker, c.value, c.unit, c.refLow, c.refHigh, c.censored]);
    expect(matched).toEqual([
      ['haemoglobin', 14.2, 'g/dL', 13, 17, null],
      ['glucose', 92, 'mg/dL', 70, 99, null],
      ['hba1c', 38, 'mmol/mol', 20, 42, null],
      ['hba1c', 5.6, '%', 4, 6, null],
      ['totalCholesterol', 212, 'mg/dL', null, 190, null],
      ['hdl', 58, 'mg/dL', 40, null, null],
      ['ldl', 128, 'mg/dL', null, 115, null],
      ['triglycerides', 132, 'mg/dL', null, 150, null],
      ['ferritin', 45, 'µg/L', 30, 400, null],
      ['vitaminD', 28.5, 'ng/mL', 30, 100, null],
      ['tsh', 1.85, 'mIU/L', 0.27, 4.2, null],
      ['crp', 0.5, 'mg/L', null, 5, '<'],
    ]);
    expect(candidates.filter((c) => c.biomarker === null).map((c) => [c.name, c.unit])).toEqual([
      ['Hematocriet', '%'],
      ['Leukocyten', '10^3/µL'],
      ['Creatinine', 'mg/dL'],
    ]);
    expect(candidates.every((c) => c.day === '2026-11-18')).toBe(true);
  });

  it('reads an English PDF text layer', () => {
    const { candidates } = parseLabText(ENGLISH_PDF, TODAY);
    expect(candidates.map((c) => c.biomarker)).toEqual(['glucose', 'hba1c', 'totalCholesterol', 'ldl', 'hdl', 'triglycerides', 'ferritin', 'vitaminD', 'tsh', 'crp', 'haemoglobin']);
    expect(find(candidates, 'TSH')).toMatchObject({ unit: 'µIU/mL', value: 2.1, refLow: 0.45, refHigh: 4.5 });
    expect(find(candidates, 'Vitamin D, 25-Hydroxy')).toMatchObject({ value: 32, unit: 'ng/mL' });
  });

  it('reads noisy OCR text without guessing', () => {
    const { candidates } = parseLabText(OCR_NOISY, TODAY);
    expect(find(candidates, 'Glucose nuchter')).toMatchObject({ biomarker: 'glucose', value: 5.2, unit: 'mmol/L', refLow: 3.9, refHigh: 5.5 });
    expect(find(candidates, 'HbAlc')).toMatchObject({ biomarker: 'hba1c', value: 5.6, unit: '%' });
    expect(find(candidates, 'Ferritine')).toMatchObject({ biomarker: 'ferritin', unit: 'µg/L' });
    expect(find(candidates, 'TSH')).toMatchObject({ biomarker: 'tsh', value: 1.85 });
    expect(find(candidates, 'LDL-cholesterol berekend')).toMatchObject({ biomarker: 'ldl' });
    expect(candidates.find((c) => c.biomarker === 'ldl')).toMatchObject({ value: 128, refHigh: 115 });
    expect(find(candidates, 'CRP')).toMatchObject({ value: 0.5, censored: '<', unit: 'mg/L', refHigh: 5 });
    expect(find(candidates, 'Vitamine D')).toMatchObject({ biomarker: 'vitaminD', value: 30.1, unit: 'ng/mL' });
    expect(find(candidates, 'Hb')).toMatchObject({ biomarker: null, unit: 'mmol/L' });
    expect(find(candidates, 'Vitamine B12')).toMatchObject({ biomarker: null, unit: 'pmol/L', value: 350 });
  });

  it('drops exact duplicates and caps the line count', () => {
    const { candidates } = parseLabText(['Glucose 5.2 mmol/L', 'Glucose 5.2 mmol/L', 'Glucose 5.3 mmol/L'], TODAY);
    expect(candidates.map((c) => c.value)).toEqual([5.2, 5.3]);
    expect(parseLabText(Array.from({ length: 6000 }, () => 'x'), TODAY).candidates).toEqual([]);
  });

  it('turns every catalogue candidate into a draft that validates', () => {
    const rows = rowsFromCandidates(parseLabText(BELGIAN_PDF, TODAY).candidates, (v) => `report ${v}`);
    for (const row of rows.filter((r) => r.matchedAs !== null)) expect(validateLabDraft(row.draft, TODAY).ok).toBe(true);
  });
});

describe('OCR rows', () => {
  const line = (text: string, left: number, top: number, width = 100, height = 20): OcrLine => ({ text, left, top, right: left + width, bottom: top + height });

  it('joins table cells on the same row from left to right', () => {
    const page = [
      line('92', 300, 102),
      line('Glucose nuchter', 20, 100, 200),
      line('mg/dL', 420, 101),
      line('70 - 99', 540, 99),
      line('Ferritine', 20, 140),
      line('30 - 400', 540, 141),
      line('45', 300, 139),
      line('µg/L', 420, 140),
    ];
    expect(assembleRows(page)).toEqual(['Glucose nuchter 92 mg/dL 70 - 99', 'Ferritine 45 µg/L 30 - 400']);
  });

  it('copes with a slightly tilted photo', () => {
    const page = [line('TSH', 20, 200), line('1,85', 300, 206), line('mU/L', 420, 210), line('CRP', 20, 240), line('<0,5', 300, 246), line('mg/L', 420, 250)];
    expect(assembleRows(page)).toEqual(['TSH 1,85 mU/L', 'CRP <0,5 mg/L']);
  });

  it('validates what the native module returns', () => {
    expect(readNativeText({ source: 'text', lines: ['a', 3, 'b'] })).toEqual({ source: 'text', lines: ['a', 'b'] });
    expect(readNativeText({ source: 'ocr', pages: [[{ text: 'TSH', left: 0, top: 0, right: 10, bottom: 10 }, { text: 'x', left: 5, top: 0, right: 1, bottom: 10 }, 'junk']] })).toEqual({
      source: 'ocr',
      pages: [[{ text: 'TSH', left: 0, top: 0, right: 10, bottom: 10 }]],
    });
    expect(readNativeText({ source: 'ocr', pages: 'nope' })).toBeNull();
    expect(readNativeText({ source: 'other' })).toBeNull();
    expect(readNativeText(null)).toBeNull();
    expect(textLines({ source: 'ocr', pages: [[line('A', 0, 0)], [line('B', 0, 0)]] })).toEqual(['A', 'B']);
  });
});

describe('review rows', () => {
  const candidates: LabCandidate[] = [
    { name: 'Glucose', biomarker: 'glucose', value: 5.2, censored: null, unit: 'mmol/L', refLow: 3.9, refHigh: 5.5, day: '2026-11-18' },
    { name: 'CRP', biomarker: 'crp', value: 0.5, censored: '<', unit: 'mg/L', refLow: null, refHigh: 5, day: null },
    { name: 'Hb', biomarker: null, value: 8.9, censored: null, unit: 'mmol/L', refLow: 8.5, refHigh: 11, day: '2026-11-18' },
  ];

  it('selects catalogue matches, leaves flagged and unmatched rows off', () => {
    const rows = rowsFromCandidates(candidates, (v) => `On the report: ${v}`);
    expect(rows.map((r) => r.selected)).toEqual([true, false, false]);
    expect(rows[1]?.draft).toMatchObject({ value: '0.5', day: '', refHigh: '5', note: 'On the report: <0.5' });
    expect(rows[2]?.draft).toMatchObject({ biomarker: '', customName: 'Hb', unit: 'mmol/L' });
    expect(rows[2]?.printedUnit).toBe('mmol/L');
  });

  it('never fills in a missing date and sets one date for every row', () => {
    const rows = rowsFromCandidates(candidates, (v) => v);
    expect(sharedDay(rows)).toBe('2026-11-18');
    expect(sharedDay(rows.slice(1, 2))).toBe('');
    expect(withDay(rows, '2026-11-01').map((r) => r.draft.day)).toEqual(['2026-11-01', '2026-11-01', '2026-11-01']);
  });

  it('pre-selects only one result per biomarker and day', () => {
    const rows = rowsFromCandidates(parseLabText(BELGIAN_PDF, TODAY).candidates, (v) => v);
    expect(rows.filter((r) => r.matchedAs === 'hba1c').map((r) => r.selected)).toEqual([true, false]);
  });

  it('remaps an unmatched row, keeping the unit only when it fits', () => {
    const rows = rowsFromCandidates(candidates, (v) => v);
    const hb = rows[2];
    if (hb === undefined) throw new Error('missing row');
    expect(remapRow(hb, 'haemoglobin').draft).toMatchObject({ biomarker: 'haemoglobin', unit: '' });
    expect(remapRow(hb, 'glucose').draft).toMatchObject({ biomarker: 'glucose', unit: 'mmol/L' });
    expect(remapRow(hb, 'custom').draft).toMatchObject({ biomarker: 'custom', customName: 'Hb', unit: 'mmol/L' });
    expect(remapRow(hb, 'nonsense')).toBe(hb);
  });

  it('validates only selected rows and reports every invalid one', () => {
    const rows = rowsFromCandidates(candidates, (v) => v).map((r) => ({ ...r, selected: true }));
    const checked = validateSelected(rows, TODAY);
    expect(checked).toEqual({ ok: false, invalid: { 'row-1': ['day'], 'row-2': ['biomarker'] } });
    const fixed = withDay(rows, '2026-11-18').map((r) => (r.id === 'row-2' ? remapRow(r, 'custom') : r));
    const ok = validateSelected(fixed, TODAY);
    expect(ok.ok && ok.inputs.map((i) => i.input.biomarker)).toEqual(['glucose', 'crp', 'custom:Hb']);
    expect(validateSelected(rows.map((r) => ({ ...r, selected: false })), TODAY)).toEqual({ ok: true, inputs: [] });
  });
});
