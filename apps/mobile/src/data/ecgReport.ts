import { ecgStrips, stripLength, traceColumns, traceRange } from './ecg';
import { escapeHtml } from './healthReportHtml';

export interface EcgReportRow {
  label: string;
  value: string;
}

export interface EcgReportInput {
  title: string;
  rows: readonly EcgReportRow[];
  stripsTitle: string;
  samples: readonly number[];
  rateHz: number | null;
  durationMs: number;
  notes: readonly string[];
  language: 'en' | 'nl';
}

const STRIP_WIDTH = 520;
const STRIP_HEIGHT = 64;
const GRID = 8;

function stripSvg(strip: readonly number[], perStrip: number, low: number, high: number, index: number): string {
  const drawn = Math.max(1, Math.round((STRIP_WIDTH * strip.length) / perStrip));
  const columns = traceColumns(strip, drawn);
  const span = high > low ? high - low : 1;
  const y = (value: number): string => (2 + (1 - (Math.min(high, Math.max(low, value)) - low) / span) * (STRIP_HEIGHT - 4)).toFixed(1);
  const step = columns.length > 1 ? drawn / (columns.length - 1) : 0;
  const path = columns.map((column, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${y(column.max)} L${(i * step).toFixed(1)} ${y(column.min)}`).join(' ');
  const grid: string[] = [];
  for (let x = 0; x <= STRIP_WIDTH; x += GRID) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="${STRIP_HEIGHT}" stroke="#f3c6cf" stroke-width="${x % (GRID * 5) === 0 ? 0.8 : 0.3}"/>`);
  for (let gy = 0; gy <= STRIP_HEIGHT; gy += GRID) grid.push(`<line x1="0" y1="${gy}" x2="${STRIP_WIDTH}" y2="${gy}" stroke="#f3c6cf" stroke-width="${gy % (GRID * 5) === 0 ? 0.8 : 0.3}"/>`);
  return `<svg class="strip" role="img" aria-label="strip ${index + 1}" width="${STRIP_WIDTH}" height="${STRIP_HEIGHT}" viewBox="0 0 ${STRIP_WIDTH} ${STRIP_HEIGHT}">${grid.join('')}<path d="${path}" fill="none" stroke="#c8325a" stroke-width="1"/></svg>`;
}

export function ecgReportHtml(input: EcgReportInput): string {
  const strips = ecgStrips(input.samples, input.rateHz, input.durationMs);
  const perStrip = stripLength(input.samples.length, input.rateHz, input.durationMs);
  const range = traceRange(input.samples);
  const low = range?.low ?? 0;
  const high = range?.high ?? 1;
  const rows = input.rows.map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`).join('');
  const traces = strips.map((strip, i) => stripSvg(strip, perStrip, low, high, i)).join('');
  const notes = input.notes.map((note) => `<p class="note">${escapeHtml(note)}</p>`).join('');
  return [
    '<!DOCTYPE html>',
    `<html lang="${input.language}"><head><meta charset="utf-8"/>`,
    '<style>body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:32px;}h1{font-size:20px;margin:0 0 12px;}h2{font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:18px 0 8px;}table{border-collapse:collapse;font-size:12px;}th{text-align:left;font-weight:600;padding:3px 16px 3px 0;}td{padding:3px 0;}.strip{display:block;margin:0 0 6px;}.note{font-size:11px;color:#444;margin:6px 0;}</style>',
    '</head><body>',
    `<h1>${escapeHtml(input.title)}</h1>`,
    `<table>${rows}</table>`,
    `<h2>${escapeHtml(input.stripsTitle)}</h2>`,
    traces,
    notes,
    '</body></html>',
  ].join('');
}
