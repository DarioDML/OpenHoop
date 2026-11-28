import type { LabResult } from '@openhoop/core';

import { formatEntered, rangeStatus, type BiomarkerRef, type LabBand } from '@/data/labs';
import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';
import type { ChipTone } from '@/ui/Chip';

export function markerName(ref: BiomarkerRef, t: TFunction): string {
  return ref.kind === 'catalogue' ? t(`health.labs.marker.${ref.id}`) : ref.name;
}

export function rangeText(result: LabResult, t: TFunction, language: Language): string | null {
  const { refLow, refHigh, unit } = result;
  if (refLow !== null && refHigh !== null) {
    return t('health.labs.range.both', { low: formatEntered(refLow, language), high: formatEntered(refHigh, language), unit });
  }
  if (refLow !== null) return t('health.labs.range.low', { low: formatEntered(refLow, language), unit });
  if (refHigh !== null) return t('health.labs.range.high', { high: formatEntered(refHigh, language), unit });
  return null;
}

export function statusText(result: LabResult, t: TFunction): string {
  const status = rangeStatus(result);
  if (status === 'inside') return t('health.labs.status.inside');
  if (status === 'outside') return t('health.labs.status.outside');
  return t('health.labs.status.none');
}

export function bandChip(band: LabBand, t: TFunction): { label: string; tone: ChipTone } {
  switch (band) {
    case 'low':
      return { label: t('health.labs.band.low'), tone: 'negative' };
    case 'high':
      return { label: t('health.labs.band.high'), tone: 'negative' };
    case 'edge':
      return { label: t('health.labs.band.edge'), tone: 'neutral' };
    case 'mid':
      return { label: t('health.labs.band.mid'), tone: 'positive' };
    default:
      return { label: t('health.labs.band.none'), tone: 'neutral' };
  }
}

export function rangeShort(result: LabResult, t: TFunction, language: Language): string {
  const { refLow, refHigh } = result;
  if (refLow !== null && refHigh !== null) return t('health.labs.rangeShort.both', { low: formatEntered(refLow, language), high: formatEntered(refHigh, language) });
  if (refHigh !== null) return t('health.labs.rangeShort.high', { high: formatEntered(refHigh, language) });
  if (refLow !== null) return t('health.labs.rangeShort.low', { low: formatEntered(refLow, language) });
  return t('health.labs.band.none');
}
