import { isRecord, type Json } from '@/lib/json';

export interface OcrLine {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type ReadText = { source: 'text'; lines: string[] } | { source: 'ocr'; pages: OcrLine[][] };

const MAX_PAGES = 50;
const MAX_LINES_PER_PAGE = 2000;
const MAX_TEXT_LENGTH = 400;
const ROW_TOLERANCE = 0.6;

function finite(value: Json | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readLine(value: Json): OcrLine | null {
  if (!isRecord(value) || typeof value.text !== 'string') return null;
  const left = finite(value.left);
  const top = finite(value.top);
  const right = finite(value.right);
  const bottom = finite(value.bottom);
  if (left === null || top === null || right === null || bottom === null || right < left || bottom < top) return null;
  const text = value.text.slice(0, MAX_TEXT_LENGTH).trim();
  return text === '' ? null : { text, left, top, right, bottom };
}

function readPages(value: Json | undefined): OcrLine[][] | null {
  if (!Array.isArray(value)) return null;
  const pages: OcrLine[][] = [];
  for (const page of value.slice(0, MAX_PAGES)) {
    if (!Array.isArray(page)) return null;
    const lines: OcrLine[] = [];
    for (const entry of page.slice(0, MAX_LINES_PER_PAGE)) {
      const line = readLine(entry);
      if (line !== null) lines.push(line);
    }
    pages.push(lines);
  }
  return pages;
}

export function readNativeText(value: Json | undefined): ReadText | null {
  if (!isRecord(value)) return null;
  if (value.source === 'text') {
    if (!Array.isArray(value.lines)) return null;
    const lines = value.lines
      .slice(0, MAX_PAGES * MAX_LINES_PER_PAGE)
      .filter((line): line is string => typeof line === 'string')
      .map((line) => line.slice(0, MAX_TEXT_LENGTH));
    return { source: 'text', lines };
  }
  if (value.source === 'ocr') {
    const pages = readPages(value.pages);
    return pages === null ? null : { source: 'ocr', pages };
  }
  return null;
}

interface Row {
  top: number;
  bottom: number;
  centre: number;
  lines: OcrLine[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function assembleRows(lines: readonly OcrLine[]): string[] {
  if (lines.length === 0) return [];
  const height = Math.max(median(lines.map((line) => line.bottom - line.top)), 1);
  const sorted = [...lines].sort((a, b) => a.top + a.bottom - (b.top + b.bottom));
  const rows: Row[] = [];
  for (const line of sorted) {
    const centre = (line.top + line.bottom) / 2;
    const row = rows[rows.length - 1];
    if (row !== undefined && Math.abs(centre - row.centre) <= height * ROW_TOLERANCE) {
      row.lines.push(line);
      row.top = Math.min(row.top, line.top);
      row.bottom = Math.max(row.bottom, line.bottom);
      row.centre = row.lines.reduce((sum, l) => sum + (l.top + l.bottom) / 2, 0) / row.lines.length;
    } else {
      rows.push({ top: line.top, bottom: line.bottom, centre, lines: [line] });
    }
  }
  return rows.map((row) =>
    [...row.lines]
      .sort((a, b) => a.left - b.left)
      .map((line) => line.text)
      .join(' '),
  );
}

export function textLines(read: ReadText): string[] {
  if (read.source === 'text') return read.lines;
  return read.pages.flatMap((page) => assembleRows(page));
}
