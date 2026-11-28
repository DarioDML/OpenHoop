import type { BodyMeasurement, DayRecord, LabResult } from '@openhoop/core';

import { createFixtureDays } from '@/data/fixtureSource';
import { DEFAULT_REPORT_SECTIONS, REPORT_SECTIONS, buildReport, checkCustomRange, localDay, parseReportPeriod, periodDates, reportStats, trendOf, type ReportInput, type ReportModel, type ReportRow } from '@/data/healthReport';
import { escapeHtml, labSpan, renderReportHtml, rowRange, sparklineSvg } from '@/data/healthReportHtml';
import { buttonPairFits } from '@/ui/health/buttonPair';
import type { Language } from '@/data/types';
import { defaultUserData } from '@/data/userData';
import { translate } from '@/i18n';

import { FIXTURE_NOW } from './support/appData';

const DAYS: DayRecord[] = createFixtureDays(FIXTURE_NOW);
const TODAY = DAYS[DAYS.length - 1]?.day ?? '';

const HOSTILE = `<script>alert('x')</script>"><img src=x onerror=alert(1)>&`;

function body(id: number, day: string, weightKg: number, bodyFatPct: number | null): BodyMeasurement {
  return { id, day, weightKg, bodyFatPct, createdAt: id, source: 'manual', origin: null };
}

function lab(id: number, patch: Partial<LabResult> = {}): LabResult {
  return { id, biomarker: 'glucose', unit: 'mmol/L', value: 5, day: TODAY, refLow: null, refHigh: null, note: null, createdAt: id, ...patch };
}

function input(patch: Partial<ReportInput> = {}): ReportInput {
  return {
    days: DAYS,
    bodyMeasurements: [],
    labResults: [],
    userData: { ...defaultUserData(), name: 'Sam' },
    profile: { birthYear: 1990, maxHeartRate: null },
    period: 30,
    sections: REPORT_SECTIONS,
    includeName: false,
    today: TODAY,
    ...patch,
  };
}

function html(model: ReportModel, language: Language = 'en'): string {
  return renderReportHtml(model, { t: (key, params) => translate(language, key, params), language });
}

function row(model: ReportModel, id: string): ReportRow {
  for (const section of model.sections) {
    const found = section.rows.find((r) => r.id === id);
    if (found) return found;
  }
  throw new Error(`no row ${id}`);
}

describe('report period', () => {
  it('parses the two periods and defaults to 30', () => {
    expect(parseReportPeriod('90')).toBe(90);
    expect(parseReportPeriod('30')).toBe(30);
    expect(parseReportPeriod('7')).toBe(30);
  });

  it('lists one date per day ending today', () => {
    const dates = periodDates('2026-11-25', 30);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe('2026-10-27');
    expect(dates[29]).toBe('2026-11-25');
    expect(periodDates('2026-11-25', 90)[0]).toBe('2026-08-28');
  });
});

describe('trendOf', () => {
  it('needs enough values', () => {
    expect(trendOf([1, 2, 3, null, null])).toBeNull();
  });

  it('detects a rise, a fall and a flat series', () => {
    expect(trendOf([1, 1.1, 1, 1.2, 5, 5.1, 5, 5.2])).toBe('up');
    expect(trendOf([5, 5.1, 5, 5.2, 1, 1.1, 1, 1.2])).toBe('down');
    expect(trendOf([5, 5.1, 4.9, 5, 5.1, 4.9, 5, 5.1])).toBe('flat');
    expect(trendOf([3, 3, 3, 3, 3, 3])).toBe('flat');
  });
});

describe('buildReport', () => {
  it('computes average, range, trend and coverage per metric for 30 days', () => {
    const model = buildReport(input());
    const readiness = row(model, 'readiness');
    const values = readiness.series.filter((v): v is number => v !== null);
    expect(readiness.totalDays).toBe(30);
    expect(readiness.coverageDays).toBe(values.length);
    expect(readiness.average).toBeCloseTo(values.reduce((a, b) => a + b, 0) / values.length, 6);
    expect(readiness.min).toBe(Math.min(...values));
    expect(readiness.max).toBe(Math.max(...values));
    expect(readiness.level).toBe('B');
    expect(row(model, 'spo2').level).toBe('A');
    expect(row(model, 'calories').level).toBe('C');
    expect(model.from).toBe('2026-10-27');
    expect(model.to).toBe(TODAY);
  });

  it('covers 90 days with the days that have records only', () => {
    const model = buildReport(input({ period: 90 }));
    const hrv = row(model, 'hrv');
    expect(hrv.totalDays).toBe(90);
    expect(hrv.coverageDays).toBeLessThanOrEqual(DAYS.length);
    expect(hrv.coverageDays).toBeGreaterThan(30);
    expect(model.from).toBe('2026-08-28');
  });

  it('leaves out unselected sections and keeps the canonical order', () => {
    const model = buildReport(input({ sections: ['vitals', 'scores'] }));
    expect(model.sections.map((s) => s.id)).toEqual(['scores', 'vitals']);
  });

  it('gives the reason instead of a number when there is no data', () => {
    const model = buildReport(input({ days: [] }));
    for (const id of ['readiness', 'hrv', 'asleep', 'calories']) {
      const r = row(model, id);
      expect(r.average).toBeNull();
      expect(r.coverageDays).toBe(0);
      expect(r.reason).not.toBeNull();
    }
    expect(row(model, 'readiness').reason).toBe('no-data');
  });

  it('reports a missing body profile as the reason for calories', () => {
    const model = buildReport(input({ profile: { birthYear: null, maxHeartRate: null } }));
    const calories = row(model, 'calories');
    expect(calories.average).toBeNull();
    expect(calories.reason).toBe('no-profile');
  });

  it('builds body rows from entries inside the period only', () => {
    const model = buildReport(
      input({
        bodyMeasurements: [body(1, '2026-01-01', 90, 30), body(2, '2026-11-01', 80, null), body(3, '2026-11-20', 79, null)],
      }),
    );
    const weight = row(model, 'weight');
    expect(weight.coverageDays).toBe(2);
    expect(weight.average).toBeCloseTo(79.5, 6);
    expect(weight.level).toBe('D');
    expect(row(model, 'bodyFat').average).toBeNull();
    expect(row(model, 'bodyFat').reason).toBe('no-body-fat');
  });

  it('marks body rows as nothing entered when there are no entries', () => {
    const model = buildReport(input());
    expect(row(model, 'weight').reason).toBe('no-entries');
    expect(row(model, 'bodyFat').reason).toBe('no-entries');
  });

  it('summarises lab values entered in the period with the user range', () => {
    const model = buildReport(
      input({
        labResults: [
          lab(1, { day: '2026-01-01', value: 9 }),
          lab(2, { day: '2026-11-01', value: 5, refLow: 3.9, refHigh: 5.6 }),
          lab(3, { day: '2026-11-20', value: 6, refLow: 3.9, refHigh: 5.6, note: 'fasting' }),
        ],
      }),
    );
    const labs = model.sections.find((s) => s.id === 'labs')?.labs ?? [];
    expect(labs).toHaveLength(1);
    expect(labs[0]?.count).toBe(2);
    expect(labs[0]?.average).toBeCloseTo(5.5, 6);
    expect(labs[0]?.latest.status).toBe('outside');
    expect(labs[0]?.latest.note).toBe('fasting');
  });

  it('counts only the lab results it could convert and says how many were left out', () => {
    const model = buildReport(
      input({
        labResults: [
          lab(1, { biomarker: 'custom:Ferritin', unit: 'ug/L', value: 40, day: '2026-11-01' }),
          lab(2, { biomarker: 'custom:Ferritin', unit: 'ng/mL', value: 50, day: '2026-11-10' }),
        ],
      }),
    );
    const entry = model.sections.find((s) => s.id === 'labs')?.labs[0];
    expect(entry?.count).toBe(1);
    expect(entry?.excluded).toBe(1);
    expect(html(model)).toContain('Not included: 1 result(s) in another unit');
  });

  it('only includes the name when asked and available', () => {
    expect(buildReport(input({ includeName: false })).name).toBeNull();
    expect(buildReport(input({ includeName: true })).name).toBe('Sam');
    expect(buildReport(input({ includeName: true, userData: defaultUserData() })).name).toBeNull();
  });
});

describe('escapeHtml', () => {
  it('escapes markup characters and strips control characters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    expect(escapeHtml('a\u0000b\u0007c')).toBe('abc');
  });
});

describe('sparklineSvg', () => {
  it('is empty without values and breaks the line at gaps', () => {
    expect(sparklineSvg([null, null], 'x')).toBe('');
    const svg = sparklineSvg([1, 2, null, 3, 4], 'x');
    expect(svg.match(/<polyline/g)).toHaveLength(2);
    expect(svg).not.toContain('NaN');
  });

  it('draws a lone value as a dot', () => {
    expect(sparklineSvg([null, 4, null], 'x')).toContain('<circle');
  });

  it('escapes the label', () => {
    expect(sparklineSvg([1, 2], HOSTILE)).not.toContain('<script>');
  });
});

describe('report ranges', () => {
  const text = { t: (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params), language: 'en' as const };

  it('shows one value when the lowest and highest are the same', () => {
    const asleep = row(buildReport(input({ days: DAYS.slice(-1) })), 'asleep');
    expect(rowRange({ ...asleep, min: 25860, max: 25860 }, text)).toBe('7 h 11 min');
    expect(rowRange({ ...asleep, min: 25200, max: 25860 }, text)).toBe('7 h – 7 h 11 min');
    expect(labSpan({ min: 84, max: 84, unit: 'mg/dL' }, 'en')).toBe('84 mg/dL');
    expect(labSpan({ min: 80, max: 84, unit: 'mg/dL' }, 'en')).toBe('80 mg/dL – 84 mg/dL');
  });

  it('stacks the export and share buttons when they do not fit side by side', () => {
    expect(buttonPairFits(['Export PDF', 'Share'], { width: 360, gutter: 16, fontScale: 1.3 })).toBe(false);
    expect(buttonPairFits(['Export PDF', 'Share'], { width: 360, gutter: 20, fontScale: 1 })).toBe(false);
    expect(buttonPairFits(['Export PDF', 'Share'], { width: 800, gutter: 20, fontScale: 1 })).toBe(true);
  });
});

describe('renderReportHtml', () => {
  it('escapes every user supplied string', () => {
    const model = buildReport(
      input({
        includeName: true,
        userData: { ...defaultUserData(), name: HOSTILE },
        labResults: [
          lab(1, { biomarker: `custom:${HOSTILE}`, unit: HOSTILE, note: HOSTILE, refLow: 1, refHigh: 2 }),
          lab(2, { biomarker: 'glucose', note: HOSTILE }),
        ],
      }),
    );
    const out = html(model);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('onerror=alert(1)>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&quot;&gt;&lt;img');
  });

  it('does not reference anything remote and blocks scripts', () => {
    const out = html(buildReport(input()));
    expect(out).not.toMatch(/https?:\/\//);
    expect(out).not.toMatch(/<(link|img|script|iframe|object|embed)\b/i);
    expect(out).not.toMatch(/url\(|@import|src=/i);
    expect(out).toContain("default-src 'none'");
    expect(out).toContain('<svg');
    expect(out).toContain('<polyline');
  });

  it('contains the standard footer with the date, in both languages', () => {
    const model = buildReport(input());
    expect(html(model, 'en')).toContain(`Not a medical device. These are OpenHoop&#39;s own estimates, not a diagnosis. Generated on ${TODAY} on this phone.`);
    const nl = html(model, 'nl');
    expect(nl).toContain('Geen medisch hulpmiddel.');
    expect(nl).toContain(`Gemaakt op ${TODAY} op deze telefoon.`);
    expect(nl).toContain('lang="nl"');
  });

  it('writes both periods and the parity levels used', () => {
    const thirty = html(buildReport(input({ period: 30 })));
    const ninety = html(buildReport(input({ period: 90 })));
    expect(thirty).toContain('(30 days)');
    expect(ninety).toContain('(90 days)');
    expect(thirty).toContain('Level A: Measured by the band itself');
    expect(thirty).toContain('Level C: Own method, different outcome');
    expect(thirty).toContain('of 30 days');
    expect(ninety).toContain('of 90 days');
  });

  it('shows the reason for missing values and never a number', () => {
    const out = html(buildReport(input({ days: [], profile: { birthYear: null, maxHeartRate: null } })));
    expect(out).toContain('No data');
    expect(out).toContain('0 of 30 days');
    expect(out).not.toContain('NaN');
    expect(out).not.toContain('<polyline');
  });

  it('shows the missing body profile reason in Dutch', () => {
    const out = html(buildReport(input({ sections: ['energy'], profile: { birthYear: null, maxHeartRate: null } })), 'nl');
    expect(out).toContain('Lichaamsprofiel onvolledig');
  });

  it('escapes a label only once in the chart description', () => {
    const model = buildReport(input({ labResults: [lab(1, { biomarker: 'custom:A & B', unit: 'x' }), lab(2, { biomarker: 'custom:A & B', unit: 'x', day: '2026-11-02' })] }));
    const out = html(model);
    expect(out).toContain('aria-label="A &amp; B"');
    expect(out).not.toContain('&amp;amp;');
  });

  it('omits the name unless included and says so for no sections', () => {
    expect(html(buildReport(input()))).not.toContain('Sam');
    expect(html(buildReport(input({ includeName: true })))).toContain('Sam');
    expect(html(buildReport(input({ sections: [] })))).toContain('No sections selected.');
  });

  it('labels lab values as entered by the user and shows their range and note', () => {
    const out = html(buildReport(input({ labResults: [lab(1, { value: 6, refLow: 3.9, refHigh: 5.6, note: 'after holiday' })] })));
    expect(out).toContain('Glucose');
    expect(out).toContain('Range on your report: 3.9 to 5.6 mmol/L');
    expect(out).toContain('Outside your report&#39;s range');
    expect(out).toContain('Your note: after holiday');
    expect(out).toContain('ships no reference ranges');
  });
});

describe('custom period, ECG and cycle sections', () => {
  it('checks a custom range against today and the maximum length', () => {
    expect(checkCustomRange('2026-11-01', '2026-11-10', '2026-11-25')).toEqual({ ok: true, range: { from: '2026-11-01', to: '2026-11-10' }, days: 10 });
    expect(checkCustomRange('2026-11-10', '2026-11-01', '2026-11-25')).toEqual({ ok: false, invalid: ['from'] });
    expect(checkCustomRange('2026-11-01', '2026-12-01', '2026-11-25')).toEqual({ ok: false, invalid: ['to'] });
    expect(checkCustomRange('2026-02-30', 'soon', '2026-11-25')).toEqual({ ok: false, invalid: ['from', 'to'] });
    expect(checkCustomRange('2024-01-01', '2026-11-25', '2026-11-25')).toEqual({ ok: false, invalid: ['from'] });
  });

  it('builds the report over the custom days', () => {
    const model = buildReport(input({ custom: { from: '2026-11-11', to: '2026-11-20' } }));
    expect(model.from).toBe('2026-11-11');
    expect(model.to).toBe('2026-11-20');
    expect(model.period).toBe(10);
    expect(row(model, 'hrv').totalDays).toBe(10);
  });

  it('lists ECG recordings in the period and never gives a verdict', () => {
    const t = Date.UTC(2026, 10, 20, 9, 30) / 1000;
    const recordings = [
      { id: 1, deviceId: 1, t, durationMs: 30_000, sampleCount: 3840, rateHz: 128, wrist: 'right' as const, symptoms: [] },
      { id: 2, deviceId: 1, t: Date.UTC(2025, 0, 1) / 1000, durationMs: 30_000, sampleCount: 3840, rateHz: 128, wrist: null, symptoms: [] },
    ];
    const model = buildReport(input({ sections: ['ecg'], ecgRecordings: recordings }));
    expect(model.sections[0]?.ecg.map((e) => e.id)).toEqual([1]);
    const out = html(model);
    expect(out).toContain('band on right wrist');
    expect(out).toContain('no rhythm verdict');
    expect(reportStats(model)).toEqual([{ id: 'ecg', row: null, count: 1 }]);
  });

  it('summarises logged cycles only when chosen', () => {
    const periods = [
      { id: 1, startDay: '2026-09-15', endDay: '2026-09-19', flow: 2 as const, createdAt: 1 },
      { id: 2, startDay: '2026-10-13', endDay: '2026-10-17', flow: 2 as const, createdAt: 2 },
      { id: 3, startDay: '2026-11-10', endDay: '2026-11-14', flow: 2 as const, createdAt: 3 },
    ];
    const model = buildReport(input({ sections: ['cycle'], periods }));
    expect(model.sections[0]?.cycle).toMatchObject({ startsInPeriod: ['2026-11-10'], averageCycleDays: 28, cyclesUsed: 2, lastStartDay: '2026-11-10' });
    expect(html(model)).toContain('Average cycle: 28.0 days (from 2 cycles)');
    expect(DEFAULT_REPORT_SECTIONS).not.toContain('cycle');
    expect(DEFAULT_REPORT_SECTIONS).not.toContain('ecg');
  });

  it('puts a recording at 00:30 local time on that local day', () => {
    const t = new Date(2026, 10, 11, 0, 30).getTime() / 1000;
    const recording = { id: 9, deviceId: 1, t, durationMs: 30_000, sampleCount: 3840, rateHz: 128, wrist: null, symptoms: [] };
    const model = buildReport(input({ sections: ['ecg'], ecgRecordings: [recording], custom: { from: '2026-11-11', to: '2026-11-11' } }));
    expect(model.sections[0]?.ecg.map((e) => e.id)).toEqual([9]);
    expect(localDay(t)).toBe('2026-11-11');
  });

  it('adds steps and zone minutes under activity', () => {
    const model = buildReport(input({ sections: ['activity'] }));
    expect(model.sections[0]?.rows.map((r) => r.id)).toEqual(['steps', 'zoneMinutes']);
  });
});
