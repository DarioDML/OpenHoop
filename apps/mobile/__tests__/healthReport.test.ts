import type { BodyMeasurement, DayRecord, LabResult } from '@openhoop/core';

import { createFixtureDays } from '@/data/fixtureSource';
import { REPORT_SECTIONS, buildReport, parseReportPeriod, periodDates, trendOf, type ReportInput, type ReportModel, type ReportRow } from '@/data/healthReport';
import { escapeHtml, renderReportHtml, sparklineSvg } from '@/data/healthReportHtml';
import type { Language } from '@/data/types';
import { defaultUserData } from '@/data/userData';
import { translate } from '@/i18n';

import { FIXTURE_NOW } from './support/appData';

const DAYS: DayRecord[] = createFixtureDays(FIXTURE_NOW);
const TODAY = DAYS[DAYS.length - 1]?.day ?? '';

const HOSTILE = `<script>alert('x')</script>"><img src=x onerror=alert(1)>&`;

function body(id: number, day: string, weightKg: number, bodyFatPct: number | null): BodyMeasurement {
  return { id, day, weightKg, bodyFatPct, createdAt: id };
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
