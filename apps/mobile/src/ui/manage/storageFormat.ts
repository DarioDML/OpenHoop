import type { Language } from '@/data/types';
import { formatNumber } from '@/lib/format';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export interface SizeParts {
  value: string;
  unit: string;
}

export function sizeParts(bytes: number, language: Language): SizeParts {
  let value = Math.max(0, bytes);
  let index = 0;
  while (value >= 1000 && index < BYTE_UNITS.length - 1) {
    value /= 1000;
    index += 1;
  }
  const decimals = index === 0 || value >= 100 ? 0 : 1;
  return { value: formatNumber(value, decimals, language), unit: BYTE_UNITS[index] ?? 'B' };
}

export function compactCount(count: number, language: Language): string {
  if (count < 1000) return formatNumber(count, 0, language);
  if (count < 1_000_000) return `${formatNumber(count / 1000, count < 10_000 ? 1 : 0, language)}k`;
  return `${formatNumber(count / 1_000_000, 1, language)}M`;
}
