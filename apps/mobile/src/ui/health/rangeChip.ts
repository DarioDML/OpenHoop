import type { Baseline, RangeStatus } from '@/data/derived';
import type { TFunction } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import type { Language } from '@/data/types';

import type { ChipTone } from '../Chip';

export interface RangeChipSpec {
  label: string;
  tone: ChipTone;
}

export function rangeChip(t: TFunction, language: Language, status: RangeStatus | null, baseline: Baseline | null, decimals: number): RangeChipSpec {
  if (status === null || baseline === null) return { label: t('range.calibrating'), tone: 'neutral' };
  const params = { low: formatNumber(baseline.low, decimals, language), high: formatNumber(baseline.high, decimals, language) };
  if (status === 'within') return { label: t('range.within', params), tone: 'positive' };
  return { label: t(status === 'above' ? 'range.above' : 'range.below', params), tone: 'warning' };
}
