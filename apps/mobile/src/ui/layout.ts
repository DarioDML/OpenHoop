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

export function breaksMidWord(lines: readonly string[]): boolean {
  return lines.slice(0, -1).some((line, i) => /[\p{L}\p{N}]$/u.test(line) && /^[\p{L}\p{N}]/u.test(lines[i + 1] ?? ''));
}
