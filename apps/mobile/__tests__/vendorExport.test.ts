import { strToU8, zipSync } from 'fflate';

import { CSV_LIMITS, parseCsv } from '@/data/vendorExport/csv';
import { cleanText, normalizeHeader, parseBoolean, parseNumber, parseTime, parseZone } from '@/data/vendorExport/fields';
import { parseVendorTexts } from '@/data/vendorExport/parse';
import { parseVendorSources, SOURCE_LIMITS, type SourceFile } from '@/data/vendorExport/sources';
import { importedAnything, summariseImport } from '@/data/vendorExport/summary';
import { dayRange, newestFirst, recoverySeries, storedTotal } from '@/data/vendorExport/view';

const CYCLES_HEADER =
  'Cycle start time,Cycle end time,Cycle timezone,Recovery score %,Resting heart rate (bpm),Heart rate variability (ms),Skin temp (celsius),Blood oxygen %,Day Strain,Sleep onset,Wake onset';
const CYCLES_CSV = [
  CYCLES_HEADER,
  '2024-01-14 22:10:00,2024-01-15 22:05:00,UTC+01:00,62,51,74.5,33.4,96.5,11.3,2024-01-14 22:20:00,2024-01-15 06:30:00',
  '2024-01-15 22:05:00,,UTC+01:00,,,,,,,,',
  '2024-01-16 22:00:00,2024-01-17 22:00:00,UTC+01:00,101,51,74.5,33.4,96.5,11.3,,',
  'garbage,,UTC+01:00,50,50,50,33,96,10,,',
].join('\n');

const SLEEPS_HEADER =
  'Cycle start time,Cycle end time,Cycle timezone,Sleep onset,Wake onset,Sleep performance %,Respiratory rate (rpm),Asleep duration (min),In bed duration (min),Light sleep duration (min),Deep (SWS) duration (min),REM duration (min),Awake duration (min),Sleep need (min),Sleep debt (min),Sleep efficiency %,Sleep consistency %,Nap';
const SLEEPS_CSV = [
  SLEEPS_HEADER,
  '2024-01-14 22:10:00,2024-01-15 22:05:00,UTC+01:00,2024-01-14 22:20:00,2024-01-15 06:30:00,88,14.2,440,490,220,90,130,50,480,20,91.5,80,false',
  '2024-01-15 22:05:00,,UTC+01:00,2024-01-15 14:00:00,2024-01-15 14:40:00,,,35,40,,,,5,,,87.5,,true',
  '2024-01-15 22:05:00,,UTC+01:00,2024-01-15 14:00:00,2024-01-15 14:40:00,,,35,40,,,,5,,,87.5,,true',
  '2024-01-16 22:05:00,,UTC+01:00,2024-01-16 22:00:00,2024-01-16 20:00:00,,,,,,,,,,,,,false',
].join('\r\n');

const WORKOUTS_CSV = [
  'Cycle start time,Cycle end time,Cycle timezone,Workout start time,Workout duration (min),Activity name,Activity Strain,Energy burned (cal),Max HR (bpm),Average HR (bpm)',
  '2024-01-14 22:10:00,,UTC+01:00,2024-01-15 17:00:00,60,Running,9.4,600,171,142',
  '2024-01-14 22:10:00,,UTC+01:00,2024-01-15 19:00:00,30,"Yoga, hot",4.1,150,120,90',
  '2024-01-14 22:10:00,,UTC+01:00,2024-01-15 20:00:00,0,Nothing,,,,',
  '2024-01-14 22:10:00,,UTC+01:00,2024-01-15 21:00:00,30,Swap,,,100,120',
].join('\n');

const JOURNAL_CSV = [
  'Cycle start time,Cycle end time,Cycle timezone,Question text,Answered yes,Notes',
  '2024-01-14 22:10:00,,UTC+01:00,Did you drink alcohol?,true,"one, with dinner"',
  '2024-01-14 22:10:00,,UTC+01:00,Did you read in bed?,false,',
  '2024-01-14 22:10:00,,UTC+01:00,Did you read in bed?,true,',
  '2024-01-14 22:10:00,,UTC+01:00,Unanswered,,',
].join('\n');

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF, a BOM and blank lines', () => {
    const result = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n,\n');
    expect(result).toEqual({
      ok: true,
      rows: [
        ['a', 'b'],
        ['x, y', 'say "hi"'],
        ['', ''],
      ],
    });
  });

  it('keeps newlines inside quoted cells and a final row without a line break', () => {
    expect(parseCsv('a,b\n"l1\nl2",z')).toEqual({
      ok: true,
      rows: [
        ['a', 'b'],
        ['l1\nl2', 'z'],
      ],
    });
  });

  it('detects a semicolon delimiter', () => {
    expect(parseCsv('a;b\n1,5;2')).toEqual({
      ok: true,
      rows: [
        ['a', 'b'],
        ['1,5', '2'],
      ],
    });
  });

  it('refuses oversized input', () => {
    expect(parseCsv(`a\n${'x'.repeat(CSV_LIMITS.maxCellChars + 1)}`)).toEqual({ ok: false, reason: 'cell-too-long' });
    expect(parseCsv(Array.from({ length: CSV_LIMITS.maxColumns + 1 }, () => 'a').join(','))).toEqual({ ok: false, reason: 'too-many-columns' });
    expect(parseCsv(`a\n${'1\n'.repeat(CSV_LIMITS.maxRows + 1)}`)).toEqual({ ok: false, reason: 'too-many-rows' });
  });

  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual({ ok: true, rows: [] });
  });
});

describe('field parsers', () => {
  it('parses numbers within range and treats blanks as missing', () => {
    expect(parseNumber('', 0, 10)).toEqual({ ok: true, value: null });
    expect(parseNumber(' 4.5 ', 0, 10)).toEqual({ ok: true, value: 4.5 });
    expect(parseNumber('4,5', 0, 10)).toEqual({ ok: true, value: 4.5 });
    expect(parseNumber('11', 0, 10)).toEqual({ ok: false });
    expect(parseNumber('-1', 0, 10)).toEqual({ ok: false });
    expect(parseNumber('1e3', 0, 10_000)).toEqual({ ok: false });
    expect(parseNumber('NaN', 0, 10)).toEqual({ ok: false });
    expect(parseNumber('Infinity', 0, 10)).toEqual({ ok: false });
    expect(parseNumber('1,000.5', 0, 10_000)).toEqual({ ok: false });
  });

  it('parses booleans in English and Dutch', () => {
    expect(parseBoolean('True')).toEqual({ ok: true, value: true });
    expect(parseBoolean('nee')).toEqual({ ok: true, value: false });
    expect(parseBoolean('')).toEqual({ ok: true, value: null });
    expect(parseBoolean('maybe')).toEqual({ ok: false });
  });

  it('cleans control characters and enforces a length cap', () => {
    expect(cleanText('  a\u0000b\tc  ', 10)).toEqual({ ok: true, value: 'a b c' });
    expect(cleanText('   ', 10)).toEqual({ ok: true, value: null });
    expect(cleanText('abcdef', 5)).toEqual({ ok: false });
  });

  it('parses zone offsets', () => {
    expect(parseZone('UTC+01:00')).toBe(3_600);
    expect(parseZone('+0530')).toBe(19_800);
    expect(parseZone('-05:00')).toBe(-18_000);
    expect(parseZone('UTC-3')).toBe(-10_800);
    expect(parseZone('Z')).toBe(0);
    expect(parseZone('UTC')).toBe(0);
    expect(parseZone('')).toBeNull();
    expect(parseZone('+15:00')).toBeNull();
    expect(parseZone('+01:75')).toBeNull();
    expect(parseZone('Europe/Brussels')).toBeNull();
  });

  it('parses timestamps with an inline offset or a zone column', () => {
    expect(parseTime('2024-01-15T06:30:00+01:00', '')).toEqual({ unix: Date.UTC(2024, 0, 15, 5, 30) / 1000, offsetS: 3_600, day: '2024-01-15' });
    expect(parseTime('2024-01-15T06:30:00Z', '')?.unix).toBe(Date.UTC(2024, 0, 15, 6, 30) / 1000);
    expect(parseTime('2024-01-15 06:30:00.250', 'UTC-05:00')).toEqual({ unix: Date.UTC(2024, 0, 15, 11, 30) / 1000, offsetS: -18_000, day: '2024-01-15' });
    expect(parseTime('2024-01-15 06:30', 'UTC')?.unix).toBe(Date.UTC(2024, 0, 15, 6, 30) / 1000);
    expect(parseTime('2024-01-15 23:30:00 +0200', 'UTC-05:00')?.offsetS).toBe(7_200);
  });

  it('rejects timestamps that cannot be placed in time', () => {
    expect(parseTime('2024-01-15 06:30:00', '')).toBeNull();
    expect(parseTime('2024-02-30 06:30:00', 'UTC')).toBeNull();
    expect(parseTime('2023-02-29 06:30:00', 'UTC')).toBeNull();
    expect(parseTime('2024-01-15 24:00:00', 'UTC')).toBeNull();
    expect(parseTime('2024-01-15 06:61:00', 'UTC')).toBeNull();
    expect(parseTime('1999-01-15 06:30:00', 'UTC')).toBeNull();
    expect(parseTime('2200-01-15 06:30:00', 'UTC')).toBeNull();
    expect(parseTime('15/01/2024 06:30', 'UTC')).toBeNull();
    expect(parseTime('', 'UTC')).toBeNull();
    expect(parseTime('2024-01-15 06:30:00 nonsense', 'UTC')).toBeNull();
  });

  it('accepts leap days', () => {
    expect(parseTime('2024-02-29 12:00:00', 'UTC')?.day).toBe('2024-02-29');
  });

  it('normalises header spelling', () => {
    expect(normalizeHeader('Resting heart rate (bpm)')).toBe('restingheartrate');
    expect(normalizeHeader('﻿Recovery score %')).toBe('recoveryscore');
    expect(normalizeHeader('Deep (SWS) duration (min)')).toBe('deepduration');
    expect(normalizeHeader('Cycle start time')).toBe('cyclestarttime');
  });
});

describe('parseVendorTexts: cycles', () => {
  const parsed = parseVendorTexts([{ name: 'physiological_cycles.csv', text: CYCLES_CSV }]);

  it('imports valid rows with their vendor values and local day', () => {
    expect(parsed.files[0]).toMatchObject({ kind: 'cycles', rows: 4, invalid: 2, problem: null });
    expect(parsed.data.cycles).toEqual([
      {
        startT: Date.UTC(2024, 0, 14, 21, 10) / 1000,
        endT: Date.UTC(2024, 0, 15, 21, 5) / 1000,
        tzOffsetS: 3_600,
        day: '2024-01-14',
        recoveryPct: 62,
        restingHr: 51,
        hrvMs: 74.5,
        skinTempC: 33.4,
        spo2Pct: 96.5,
        respiratoryRate: null,
        dayStrain: 11.3,
      },
    ]);
  });

  it('counts out-of-range and unparseable rows as invalid and rows without values as skipped', () => {
    expect(parsed.totals.cycles).toEqual({ invalid: 2, skipped: 1 });
  });

  it('is tolerant to column order, extra columns and missing columns', () => {
    const text = ['Unknown thing,Day Strain,Cycle timezone,Cycle start time,Recovery score %', 'x,12.5,UTC,2024-03-01 08:00:00,40'].join('\n');
    const result = parseVendorTexts([{ name: 'any.csv', text }]);
    expect(result.data.cycles).toHaveLength(1);
    expect(result.data.cycles[0]).toMatchObject({ recoveryPct: 40, dayStrain: 12.5, restingHr: null, hrvMs: null, endT: null, day: '2024-03-01' });
  });

  it('rejects a cycle that ends before it starts', () => {
    const text = [CYCLES_HEADER, '2024-01-15 22:00:00,2024-01-15 21:00:00,UTC,50,50,50,33,96,10,,'].join('\n');
    expect(parseVendorTexts([{ name: 'c.csv', text }]).totals.cycles.invalid).toBe(1);
  });

  it('keeps one row when the same cycle appears twice', () => {
    const row = '2024-01-15 22:00:00,,UTC,50,50,50,33,96,10,,';
    const result = parseVendorTexts([{ name: 'c.csv', text: [CYCLES_HEADER, row, row].join('\n') }]);
    expect(result.data.cycles).toHaveLength(1);
    expect(result.totals.cycles.skipped).toBe(1);
  });
});

describe('parseVendorTexts: sleeps', () => {
  const parsed = parseVendorTexts([{ name: 'sleeps.csv', text: SLEEPS_CSV }]);

  it('imports a night and a nap with stage minutes and performance', () => {
    expect(parsed.files[0]?.kind).toBe('sleeps');
    expect(parsed.data.sleeps).toHaveLength(2);
    expect(parsed.data.sleeps[0]).toEqual({
      onset: Date.UTC(2024, 0, 14, 21, 20) / 1000,
      wake: Date.UTC(2024, 0, 15, 5, 30) / 1000,
      tzOffsetS: 3_600,
      day: '2024-01-14',
      nap: false,
      performancePct: 88,
      asleepMin: 440,
      inBedMin: 490,
      lightMin: 220,
      deepMin: 90,
      remMin: 130,
      awakeMin: 50,
      efficiencyPct: 91.5,
      consistencyPct: 80,
      respiratoryRate: 14.2,
    });
    expect(parsed.data.sleeps[1]).toMatchObject({ nap: true, asleepMin: 35, performancePct: null });
  });

  it('skips duplicates and rejects a wake time before onset', () => {
    expect(parsed.totals.sleeps).toEqual({ invalid: 1, skipped: 1 });
  });

  it('rejects more time asleep than in bed and out-of-range durations', () => {
    const base = '2024-01-15 22:05:00,,UTC,2024-01-15 22:00:00,2024-01-16 06:00:00';
    const text = [
      SLEEPS_HEADER,
      `${base},,,500,480,,,,,,,,,`,
      `${base},,,100,2000,,,,,,,,,`,
      `${base},150,,,,,,,,,,,,`,
    ].join('\n');
    expect(parseVendorTexts([{ name: 's.csv', text }]).totals.sleeps.invalid).toBe(3);
  });

  it('rejects a sleep longer than a day', () => {
    const text = [SLEEPS_HEADER, '2024-01-15 22:05:00,,UTC,2024-01-10 22:00:00,2024-01-16 06:00:00,,,,,,,,,,,,,'].join('\n');
    expect(parseVendorTexts([{ name: 's.csv', text }]).totals.sleeps.invalid).toBe(1);
  });
});

describe('parseVendorTexts: workouts and journal', () => {
  it('imports workouts with an end time from the duration and quoted names', () => {
    const parsed = parseVendorTexts([{ name: 'workouts.csv', text: WORKOUTS_CSV }]);
    expect(parsed.data.workouts).toHaveLength(2);
    expect(parsed.data.workouts[0]).toEqual({
      startT: Date.UTC(2024, 0, 15, 16, 0) / 1000,
      endT: Date.UTC(2024, 0, 15, 17, 0) / 1000,
      tzOffsetS: 3_600,
      day: '2024-01-15',
      activity: 'Running',
      strain: 9.4,
      avgHr: 142,
      maxHr: 171,
    });
    expect(parsed.data.workouts[1]).toMatchObject({ activity: 'Yoga, hot', strain: 4.1 });
    expect(parsed.totals.workouts.invalid).toBe(2);
  });

  it('imports journal answers, skipping repeats and rejecting unanswered questions', () => {
    const parsed = parseVendorTexts([{ name: 'journal_entries.csv', text: JOURNAL_CSV }]);
    expect(parsed.data.journal).toEqual([
      {
        cycleStart: Date.UTC(2024, 0, 14, 21, 10) / 1000,
        tzOffsetS: 3_600,
        day: '2024-01-14',
        question: 'Did you drink alcohol?',
        answeredYes: true,
        notes: 'one, with dinner',
      },
      {
        cycleStart: Date.UTC(2024, 0, 14, 21, 10) / 1000,
        tzOffsetS: 3_600,
        day: '2024-01-14',
        question: 'Did you read in bed?',
        answeredYes: false,
        notes: null,
      },
    ]);
    expect(parsed.totals.journal).toEqual({ invalid: 1, skipped: 1 });
  });
});

describe('parseVendorTexts: file level', () => {
  it('reports unrecognised, empty and header-only files', () => {
    const result = parseVendorTexts([
      { name: 'other.csv', text: 'a,b\n1,2' },
      { name: 'empty.csv', text: '' },
      { name: 'cycles.csv', text: CYCLES_HEADER },
    ]);
    expect(result.files.map((f) => f.problem)).toEqual(['unrecognised', 'empty', null]);
    expect(result.files[2]).toMatchObject({ kind: 'cycles', rows: 0 });
    expect(result.data.cycles).toEqual([]);
  });

  it('classifies files by their columns, not by their name', () => {
    const result = parseVendorTexts([
      { name: 'a.csv', text: JOURNAL_CSV },
      { name: 'b.csv', text: WORKOUTS_CSV },
      { name: 'c.csv', text: SLEEPS_CSV },
      { name: 'd.csv', text: CYCLES_CSV },
    ]);
    expect(result.files.map((f) => f.kind)).toEqual(['journal', 'workouts', 'sleeps', 'cycles']);
  });

  it('treats text that looks like a formula as plain data', () => {
    const text = ['Cycle start time,Cycle timezone,Question text,Answered yes,Notes', '2024-01-14 22:10:00,UTC,=1+1,true,@SUM(A1)'].join('\n');
    const entry = parseVendorTexts([{ name: 'j.csv', text }]).data.journal[0];
    expect(entry).toMatchObject({ question: '=1+1', notes: '@SUM(A1)' });
  });

  it('refuses an overlong journal note', () => {
    const text = ['Cycle start time,Cycle timezone,Question text,Answered yes,Notes', `2024-01-14 22:10:00,UTC,Q,true,${'n'.repeat(1_001)}`].join('\n');
    expect(parseVendorTexts([{ name: 'j.csv', text }]).totals.journal.invalid).toBe(1);
  });
});

describe('parseVendorSources', () => {
  const csv = (name: string, text: string): SourceFile => ({ name, bytes: strToU8(text) });

  it('reads a ZIP with the four files, ignoring other entries and folders', () => {
    const zip = zipSync({
      'export/physiological_cycles.csv': strToU8(CYCLES_CSV),
      'export/sleeps.csv': strToU8(SLEEPS_CSV),
      'export/workouts.csv': strToU8(WORKOUTS_CSV),
      'export/journal_entries.csv': strToU8(JOURNAL_CSV),
      'export/readme.txt': strToU8('hello'),
      '__MACOSX/export/._sleeps.csv': strToU8('junk'),
    });
    const result = parseVendorSources([{ name: 'export.zip', bytes: zip }]);
    expect(result.files.map((f) => f.kind)).toEqual(['cycles', 'sleeps', 'workouts', 'journal']);
    expect(result.files.every((f) => f.problem === null)).toBe(true);
    expect(result.data.cycles).toHaveLength(1);
    expect(result.data.sleeps).toHaveLength(2);
    expect(result.data.workouts).toHaveLength(2);
    expect(result.data.journal).toHaveLength(2);
  });

  it('reads a mix of loose CSV files and reports unsupported ones', () => {
    const result = parseVendorSources([csv('sleeps.csv', SLEEPS_CSV), csv('photo.png', 'x')]);
    expect(result.files.map((f) => [f.name, f.problem])).toEqual([
      ['photo.png', 'unsupported'],
      ['sleeps.csv', null],
    ]);
  });

  it('rejects a ZIP whose declared size is too large before inflating it', () => {
    const big = zipSync({ 'cycles.csv': new Uint8Array(3_000_000) });
    const limits = { ...SOURCE_LIMITS, maxEntryBytes: 1_000_000 };
    const result = parseVendorSources([{ name: 'bomb.zip', bytes: big }], limits);
    expect(result.files).toEqual([{ name: 'bomb.zip', kind: null, rows: 0, invalid: 0, problem: 'zip-limits' }]);
    expect(result.data.cycles).toEqual([]);
  });

  it('applies the total decompressed limit across entries and across ZIP files', () => {
    const entry = new Uint8Array(600_000);
    const two = zipSync({ 'a.csv': entry, 'b.csv': entry });
    const limits = { ...SOURCE_LIMITS, maxTotalBytes: 1_000_000 };
    expect(parseVendorSources([{ name: 'two.zip', bytes: two }], limits).files[0]?.problem).toBe('zip-limits');
    const single = zipSync({ 'a.csv': entry });
    const split = parseVendorSources(
      [
        { name: 'first.zip', bytes: single },
        { name: 'second.zip', bytes: single },
      ],
      limits,
    );
    expect(split.files.map((f) => [f.name, f.problem])).toEqual([
      ['second.zip', 'zip-limits'],
      ['a.csv', 'csv-limits'],
    ]);
  });

  it('limits the number of entries', () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < 5; i++) entries[`f${i}.csv`] = strToU8('a');
    const result = parseVendorSources([{ name: 'many.zip', bytes: zipSync(entries) }], { ...SOURCE_LIMITS, maxEntries: 4 });
    expect(result.files[0]?.problem).toBe('zip-limits');
  });

  it('refuses a picked file over the size limit and a corrupt archive', () => {
    const tooBig = { name: 'cycles.csv', bytes: new Uint8Array(100) };
    expect(parseVendorSources([tooBig], { ...SOURCE_LIMITS, maxPickedBytes: 50 }).files[0]?.problem).toBe('too-large');
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseVendorSources([{ name: 'broken.zip', bytes: corrupt }]).files[0]?.problem).toBe('unreadable');
  });

  it('reports a ZIP with no CSV files', () => {
    const zip = zipSync({ 'notes.txt': strToU8('hi') });
    expect(parseVendorSources([{ name: 'x.zip', bytes: zip }]).files[0]?.problem).toBe('unsupported');
  });
});

describe('import summary and view helpers', () => {
  const parsed = parseVendorSources([
    { name: 'physiological_cycles.csv', bytes: strToU8(CYCLES_CSV) },
    { name: 'sleeps.csv', bytes: strToU8(SLEEPS_CSV) },
  ]);

  it('adds rows that were already stored to the skipped count', () => {
    const written = {
      cycles: { imported: 0, skipped: 1 },
      sleeps: { imported: 1, skipped: 1 },
      workouts: { imported: 0, skipped: 0 },
      journal: { imported: 0, skipped: 0 },
    };
    const result = summariseImport(parsed, written, [{ name: 'big.zip', kind: null, rows: 0, invalid: 0, problem: 'too-large' }]);
    expect(result.counts.cycles).toEqual({ imported: 0, skipped: 2, invalid: 2 });
    expect(result.counts.sleeps).toEqual({ imported: 1, skipped: 2, invalid: 1 });
    expect(result.files.map((f) => f.name)).toEqual(['big.zip', 'physiological_cycles.csv', 'sleeps.csv']);
    expect(importedAnything(result)).toBe(true);
  });

  it('recognises an import that found nothing', () => {
    const none = parseVendorTexts([{ name: 'a.csv', text: 'a,b' }]);
    const zero = { imported: 0, skipped: 0 };
    const result = summariseImport(none, { cycles: zero, sleeps: zero, workouts: zero, journal: zero }, []);
    expect(importedAnything(result)).toBe(false);
  });

  it('builds the recovery series from the newest cycles that have a value', () => {
    const cycle = (day: string, recoveryPct: number | null) => ({
      startT: Date.parse(`${day}T00:00:00Z`) / 1000,
      endT: null,
      tzOffsetS: 0,
      day,
      recoveryPct,
      restingHr: null,
      hrvMs: null,
      skinTempC: null,
      spo2Pct: null,
      respiratoryRate: null,
      dayStrain: null,
    });
    const data = { cycles: [cycle('2024-01-01', 40), cycle('2024-01-02', null), cycle('2024-01-03', 60), cycle('2024-01-04', 80)], sleeps: [], workouts: [], journal: [] };
    expect(recoverySeries(data, 2)).toEqual({ values: [60, 80], firstDay: '2024-01-03', lastDay: '2024-01-04' });
    expect(recoverySeries({ ...data, cycles: [] })).toEqual({ values: [], firstDay: null, lastDay: null });
    expect(dayRange(data)).toEqual({ first: '2024-01-01', last: '2024-01-04' });
    expect(dayRange({ cycles: [], sleeps: [], workouts: [], journal: [] })).toBeNull();
    expect(storedTotal(data)).toBe(4);
    expect(newestFirst([1, 2, 3])).toEqual([3, 2, 1]);
  });
});
