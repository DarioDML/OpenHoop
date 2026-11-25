import { reasonText, type TranslationKey } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { formatDuration, formatNumber, formatSigned } from '@/lib/format';

import { formatConverted, formatEntered, type BiomarkerRef } from './labs';
import {
  REASON_NO_BODY_FAT,
  REASON_NO_ENTRIES,
  type ReportLab,
  type ReportModel,
  type ReportRow,
  type ReportSection,
  type TrendDirection,
} from './healthReport';
import type { Language, ParityLevel } from './types';

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function escapeHtml(text: string): string {
  return text
    .replace(CONTROL, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 30;
const SPARK_PAD = 3;

function coordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '0';
}

export function sparklineSvg(values: ReadonlyArray<number | null>, label: string): string {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length === 0) return '';
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const span = hi - lo || 1;
  const x = (i: number): number => (values.length <= 1 ? SPARK_WIDTH / 2 : SPARK_PAD + (i / (values.length - 1)) * (SPARK_WIDTH - SPARK_PAD * 2));
  const y = (v: number): number => (hi === lo ? SPARK_HEIGHT / 2 : SPARK_HEIGHT - SPARK_PAD - ((v - lo) / span) * (SPARK_HEIGHT - SPARK_PAD * 2));
  const segments: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  values.forEach((value, i) => {
    if (value === null || !Number.isFinite(value)) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push([x(i), y(value)]);
    }
  });
  if (current.length > 0) segments.push(current);
  const marks = segments
    .map((segment) => {
      const [first] = segment;
      if (first === undefined) return '';
      if (segment.length === 1) return `<circle cx="${coordinate(first[0])}" cy="${coordinate(first[1])}" r="1.8" fill="#222"/>`;
      const points = segment.map(([px, py]) => `${coordinate(px)},${coordinate(py)}`).join(' ');
      return `<polyline points="${points}" fill="none" stroke="#222" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join('');
  return `<svg role="img" aria-label="${escapeHtml(label)}" width="${SPARK_WIDTH}" height="${SPARK_HEIGHT}" viewBox="0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}">${marks}</svg>`;
}

const SECTION_TITLE: Readonly<Record<ReportSection['id'], TranslationKey>> = {
  scores: 'health.report.section.scores',
  sleep: 'health.report.section.sleep',
  vitals: 'health.report.section.vitals',
  energy: 'health.report.section.energy',
  body: 'health.report.section.body',
  labs: 'health.report.section.labs',
};

const TREND_TEXT: Readonly<Record<TrendDirection, TranslationKey>> = {
  up: 'health.report.trend.up',
  down: 'health.report.trend.down',
  flat: 'health.report.trend.flat',
};

export interface ReportText {
  t: TFunction;
  language: Language;
}

export function sectionTitle(id: ReportSection['id'], t: TFunction): string {
  return t(SECTION_TITLE[id]);
}

export function trendText(trend: TrendDirection | null, t: TFunction): string {
  return trend === null ? t('health.report.trend.none') : t(TREND_TEXT[trend]);
}

export function missingText(reason: string, { t, language }: ReportText): string {
  if (reason === REASON_NO_ENTRIES) return t('health.report.reason.noEntries');
  if (reason === REASON_NO_BODY_FAT) return t('health.report.reason.noBodyFat');
  return reasonText(language, reason);
}

export function rowValue(row: ReportRow, value: number, { t, language }: ReportText): string {
  if (row.kind === 'duration') {
    const text = formatDuration(t, Math.abs(value));
    if (!row.signed) return text;
    return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
  }
  const text = row.signed ? formatSigned(value, row.decimals, language) : formatNumber(value, row.decimals, language);
  return row.unitKey === null ? text : `${text} ${t(row.unitKey)}`;
}

export function rowRange(row: ReportRow, text: ReportText): string | null {
  if (row.min === null || row.max === null) return null;
  return `${rowValue(row, row.min, text)} – ${rowValue(row, row.max, text)}`;
}

export function coverageText(days: number, total: number, t: TFunction): string {
  return t('health.report.coverage', { days, total });
}

export function labName(ref: BiomarkerRef, t: TFunction): string {
  return ref.kind === 'catalogue' ? t(`health.labs.marker.${ref.id}`) : ref.name;
}

export function labValue(value: number, unit: string, language: Language): string {
  return `${formatConverted(value, language)} ${unit}`;
}

export function labRange(lab: ReportLab, { t, language }: ReportText): string {
  const { refLow, refHigh, unit } = lab.latest;
  if (refLow !== null && refHigh !== null) {
    return t('health.labs.range.both', { low: formatEntered(refLow, language), high: formatEntered(refHigh, language), unit });
  }
  if (refLow !== null) return t('health.labs.range.low', { low: formatEntered(refLow, language), unit });
  if (refHigh !== null) return t('health.labs.range.high', { high: formatEntered(refHigh, language), unit });
  return t('health.labs.status.none');
}

export function labStatus(lab: ReportLab, t: TFunction): string | null {
  if (lab.latest.status === 'inside') return t('health.labs.status.inside');
  if (lab.latest.status === 'outside') return t('health.labs.status.outside');
  return null;
}

const STYLE = `
*{box-sizing:border-box}
body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111;font-size:11px;line-height:1.4;margin:0;padding:24px}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:14px;margin:22px 0 6px;padding-bottom:3px;border-bottom:1.5px solid #111}
.sub{color:#444;margin:0 0 4px;font-size:12px}
table{width:100%;border-collapse:collapse;margin-bottom:6px}
th{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#555;text-align:left;padding:4px 6px;border-bottom:1px solid #999}
td{padding:5px 6px;border-bottom:1px solid #ddd;vertical-align:middle}
tr{page-break-inside:avoid}
.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.missing{color:#555;font-style:italic}
.level{display:inline-block;min-width:16px;text-align:center;border:1px solid #111;border-radius:8px;font-size:9px;padding:0 4px}
.note{color:#444;font-size:10px;margin:4px 0}
.legend{margin-top:14px;font-size:10px;color:#333}
.legend div{margin:1px 0}
footer{margin-top:22px;padding-top:8px;border-top:1px solid #999;font-size:10px;color:#333}
`;

function cell(content: string, className = '', colspan = 1): string {
  const classAttr = className === '' ? '' : ` class="${className}"`;
  const spanAttr = colspan === 1 ? '' : ` colspan="${colspan}"`;
  return `<td${classAttr}${spanAttr}>${content}</td>`;
}

function levelCell(level: ParityLevel, t: TFunction): string {
  return cell(`<span class="level" title="${escapeHtml(t(`level.${level}`))}">${level}</span>`);
}

function rowHtml(row: ReportRow, text: ReportText): string {
  const { t } = text;
  const label = escapeHtml(t(row.labelKey));
  const coverage = escapeHtml(coverageText(row.coverageDays, row.totalDays, t));
  if (row.average === null || row.reason !== null) {
    const reason = escapeHtml(missingText(row.reason ?? 'no-data', text));
    return `<tr>${cell(label)}${cell(reason, 'missing', 3)}${cell(coverage, 'num')}${levelCell(row.level, t)}</tr>`;
  }
  return `<tr>${cell(label)}${cell(escapeHtml(rowValue(row, row.average, text)), 'num')}${cell(escapeHtml(rowRange(row, text) ?? ''), 'num')}${cell(
    sparklineSvg(row.series, label) + `<div class="note">${escapeHtml(trendText(row.trend, t))}</div>`,
  )}${cell(coverage, 'num')}${levelCell(row.level, t)}</tr>`;
}

function labHtml(lab: ReportLab, text: ReportText): string {
  const { t, language } = text;
  const name = escapeHtml(labName(lab.ref, t));
  const status = labStatus(lab, t);
  const lines = [
    escapeHtml(t('health.report.labs.latest', { value: labValue(lab.latest.value, lab.latest.unit, language), day: lab.latest.day })),
    escapeHtml(labRange(lab, text)),
    ...(status === null ? [] : [escapeHtml(status)]),
    ...(lab.latest.note === null ? [] : [escapeHtml(t('health.report.labs.note', { note: lab.latest.note }))]),
  ];
  const average = escapeHtml(labValue(lab.average, lab.unit, language));
  const range = escapeHtml(`${labValue(lab.min, lab.unit, language)} – ${labValue(lab.max, lab.unit, language)}`);
  return `<tr>${cell(`${name}${lines.map((line) => `<div class="note">${line}</div>`).join('')}`)}${cell(average, 'num')}${cell(range, 'num')}${cell(
    sparklineSvg(lab.values, name) + `<div class="note">${escapeHtml(trendText(lab.trend, t))}</div>`,
  )}${cell(escapeHtml(t('health.report.labs.count', { count: lab.count })), 'num')}${levelCell('D', t)}</tr>`;
}

function sectionHtml(section: ReportSection, text: ReportText): string {
  const { t } = text;
  const head = (['health.report.col.measure', 'health.report.col.average', 'health.report.col.range', 'health.report.col.trend', 'health.report.col.coverage', 'health.report.col.level'] as const)
    .map((key) => `<th>${escapeHtml(t(key))}</th>`)
    .join('');
  const body =
    section.id === 'labs'
      ? section.labs.length === 0
        ? `<tr><td class="missing" colspan="6">${escapeHtml(t('health.report.labs.empty'))}</td></tr>`
        : section.labs.map((lab) => labHtml(lab, text)).join('')
      : section.rows.map((row) => rowHtml(row, text)).join('');
  const note = section.id === 'labs' ? `<p class="note">${escapeHtml(t('health.report.labs.enteredNote'))}</p>` : '';
  return `<section><h2>${escapeHtml(sectionTitle(section.id, t))}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${note}</section>`;
}

function usedLevels(model: ReportModel): ParityLevel[] {
  const levels = new Set<ParityLevel>();
  for (const section of model.sections) {
    for (const row of section.rows) levels.add(row.level);
    if (section.labs.length > 0) levels.add('D');
  }
  return (['A', 'B', 'C', 'D'] as const).filter((level) => levels.has(level));
}

export function renderReportHtml(model: ReportModel, text: ReportText): string {
  const { t, language } = text;
  const title = escapeHtml(t('health.report.docTitle'));
  const subtitle = t('health.report.subtitle', { from: model.from, to: model.to, days: model.period });
  const who = model.name === null ? '' : `<p class="sub">${escapeHtml(model.name)}</p>`;
  const legend = usedLevels(model)
    .map((level) => `<div>${escapeHtml(t('level.label', { level }))}: ${escapeHtml(t(`level.${level}`))}</div>`)
    .join('');
  const sections = model.sections.map((section) => sectionHtml(section, text)).join('');
  const empty = model.sections.length === 0 ? `<p class="missing">${escapeHtml(t('health.report.noSections'))}</p>` : '';
  const footer = escapeHtml(t('health.report.footer', { date: model.generatedOn }));
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${STYLE}</style></head><body><header><h1>${title}</h1>${who}<p class="sub">${escapeHtml(subtitle)}</p></header>${sections}${empty}<div class="legend">${legend}</div><footer>${footer}</footer></body></html>`;
}
