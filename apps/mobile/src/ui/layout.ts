import { useWindowDimensions } from 'react-native';

export const GUTTER = 20;
export const COMPACT_GUTTER = 16;
const COMPACT_TEXT_WIDTH = 340;
const NARROW_TEXT_WIDTH = 300;

export interface Layout {
  width: number;
  height: number;
  fontScale: number;
  textWidth: number;
  compact: boolean;
  narrow: boolean;
  gutter: number;
}

export function layoutFor(width: number, height: number, fontScale: number): Layout {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const textWidth = width / Math.max(1, scale);
  const compact = textWidth < COMPACT_TEXT_WIDTH;
  const narrow = textWidth < NARROW_TEXT_WIDTH;
  return { width, height, fontScale: scale, textWidth, compact, narrow, gutter: compact ? COMPACT_GUTTER : GUTTER };
}

export function useLayout(): Layout {
  const { width, height, fontScale } = useWindowDimensions();
  return layoutFor(width, height, fontScale);
}

export function heroRingSize(layout: Layout, columns = 3, gap = 8, max = 104): number {
  const available = layout.width - layout.gutter * 2 - gap * (columns - 1);
  return Math.max(72, Math.min(max, Math.floor(available / columns) - 4));
}

export function fitsSideBySide(layout: Layout, inset: number, minEach: number, count = 2, gap = 8): boolean {
  const available = layout.width - layout.gutter * 2 - inset * 2 - gap * (count - 1);
  return available / count >= minEach * layout.fontScale;
}

export function trailFitsInline(rowWidth: number | null, fixed: number, trailWidth: number | null, minMiddle: number): boolean {
  if (rowWidth === null || trailWidth === null) return true;
  return rowWidth - fixed - trailWidth >= minMiddle;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

export function breaksMidWord(text: string, lines: readonly string[]): boolean {
  const source = text.toLowerCase();
  let cursor = 0;
  for (const line of lines.slice(0, -1)) {
    while (cursor < source.length && /\s/u.test(source[cursor] ?? '')) cursor += 1;
    const content = line.trim().toLowerCase();
    if (content === '') continue;
    if (!source.startsWith(content, cursor)) return false;
    cursor += content.length;
    if (WORD_CHAR.test(source[cursor - 1] ?? '') && WORD_CHAR.test(source[cursor] ?? '')) return true;
  }
  return false;
}

export const MIN_FIT_TEXT_DP = 11;

export function fitFontSize(base: number, fontScale: number, cap: number, shrink: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const wanted = base * (cap > 0 ? Math.min(scale, cap) : scale);
  const floor = Math.min(wanted, Math.max(base, MIN_FIT_TEXT_DP));
  return Math.max(floor, wanted * shrink);
}

export function fitArt(available: number | null, fallback: number, min: number, max: number): number {
  const wanted = available === null || !Number.isFinite(available) ? fallback : available;
  return Math.round(Math.max(min, Math.min(max, wanted)));
}
