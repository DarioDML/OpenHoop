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

export interface WordFitStyle {
  fontSize: number;
  letterSpacing?: number;
  uppercase?: boolean;
  bold?: boolean;
}

const NARROW_GLYPHS = new Set(['i', 'l', 'j', 't', 'f', 'r', 'I', '.', ',', "'", ':', ';', '!', '|', '(', ')', '·']);
const WIDE_GLYPHS = new Set(['m', 'w', 'M', 'W', '%', '@']);

function glyphEm(char: string, uppercase: boolean): number {
  const shown = uppercase ? char.toUpperCase() : char;
  if (NARROW_GLYPHS.has(shown)) return shown === 'I' ? 0.32 : 0.3;
  if (WIDE_GLYPHS.has(shown)) return 0.92;
  if (/[0-9]/.test(shown)) return 0.62;
  if (shown !== shown.toLowerCase()) return 0.72;
  return 0.58;
}

export function estimateWordWidth(word: string, style: WordFitStyle): number {
  const uppercase = style.uppercase ?? false;
  const weight = style.bold ? 1.05 : 1;
  const chars = Array.from(word);
  const glyphs = chars.reduce((sum, char) => sum + glyphEm(char, uppercase), 0);
  return glyphs * style.fontSize * weight + chars.length * (style.letterSpacing ?? 0);
}

export function wordFitScale(text: string, width: number, style: WordFitStyle, minScale = 0.7): number {
  if (!(width > 0)) return Number.POSITIVE_INFINITY;
  const widest = text.split(/\s+/).reduce((max, word) => Math.max(max, estimateWordWidth(word, style)), 0);
  if (widest <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(minScale, width / widest);
}
