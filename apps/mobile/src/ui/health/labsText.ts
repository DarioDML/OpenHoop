import type { LabResult } from '@openhoop/core';

import { formatEntered, rangeStatus, type BiomarkerRef } from '@/data/labs';
import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';

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
