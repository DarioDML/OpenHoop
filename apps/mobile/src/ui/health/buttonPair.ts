import type { Layout } from '../layout';
import { spacing } from '../theme';

const CAP_FONT = 13;
const CAP_SPACING = 1.8;
const CAP_GLYPH = 0.68;
const CAP_MAX_SCALE = 1.4;
const ICON = 18;

export function buttonLabelWidth(label: string, fontScale: number): number {
  const scale = Math.min(Math.max(fontScale, 1), CAP_MAX_SCALE);
  return [...label].length * (CAP_FONT * CAP_GLYPH * scale + CAP_SPACING);
}

export function buttonPairFits(labels: readonly [string, string], layout: Pick<Layout, 'width' | 'gutter' | 'fontScale'>, gap: number = spacing.md): boolean {
  const each = (layout.width - layout.gutter * 2 - gap) / 2;
  const chrome = spacing.xl * 2 + ICON + spacing.sm;
  return labels.every((label) => chrome + buttonLabelWidth(label, layout.fontScale) <= each);
}
