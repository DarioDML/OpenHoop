import type { Contributor, ContributorId, ScaleZone } from '@/data/contributors';
import type { Language, Units } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { formatWeight } from '@/lib/units';
import type { ChipTone } from '@/ui/Chip';

export const CONTRIBUTOR_NAME: Readonly<Record<ContributorId, TranslationKey>> = {
  sleepConsistency: 'health.contrib.sleepConsistency',
  sleepHours: 'health.contrib.sleepHours',
  moderateVigorous: 'health.contrib.moderateVigorous',
  zones45: 'health.contrib.zones45',
  strength: 'health.contrib.strength',
  steps: 'health.contrib.steps',
  vo2max: 'health.contrib.vo2max',
  restingHr: 'health.contrib.restingHr',
  leanMass: 'health.contrib.leanMass',
};

export interface ContributorText {
  t: TFunction;
  language: Language;
  units: Units;
}

function hoursMinutes(seconds: number): string {
  const total = Math.round(seconds / 60);
  return `${Math.floor(total / 60)}:${`${total % 60}`.padStart(2, '0')}`;
}

function weekMinutes(minutes: number, { t, language }: ContributorText): string {
  if (minutes >= 60) return t('health.contrib.fmt.perWeek', { value: hoursMinutes(minutes * 60) });
  return t('health.contrib.fmt.minPerWeek', { value: formatNumber(minutes, 0, language) });
}

export function formatContributor(id: ContributorId, value: number, text: ContributorText): string {
  const { t, language, units } = text;
  switch (id) {
    case 'sleepConsistency':
      return `${formatNumber(value, 0, language)}%`;
    case 'sleepHours':
      return hoursMinutes(value);
    case 'moderateVigorous':
    case 'zones45':
      return weekMinutes(value, text);
    case 'strength':
      return t('health.contrib.fmt.daysPerWeek', { value: formatNumber(value, 1, language) });
    case 'steps':
      return t('health.contrib.fmt.perDay', { value: formatNumber(Math.round(value / 10) * 10, 0, language) });
    case 'vo2max':
      return formatNumber(value, 0, language);
    case 'restingHr':
      return `${formatNumber(value, 0, language)} ${t('unit.bpm')}`;
    case 'leanMass': {
      const weight = formatWeight(value, units, language);
      return `${weight.value} ${weight.unit}`;
    }
  }
}

export function contributorValue(c: Contributor, text: ContributorText): string | null {
  return c.value === null ? null : formatContributor(c.id, c.value, text);
}

export function contributorTarget(c: Contributor, text: ContributorText): string | null {
  const { t, language } = text;
  const { target } = c;
  if (target.kind === 'none') return null;
  if (c.id === 'sleepHours') return t('health.contrib.fmt.hours', { low: formatNumber(target.low / 3600, 0, language), high: formatNumber((target.high ?? target.low) / 3600, 0, language) });
  if (c.id === 'strength') return t('health.contrib.fmt.atLeastDays', { value: formatNumber(target.low, 0, language) });
  if (c.id === 'moderateVigorous') return t('health.contrib.fmt.minRange', { low: formatNumber(target.low, 0, language), high: formatNumber(target.high ?? target.low, 0, language) });
  if (c.id === 'steps') return t('health.contrib.fmt.perDay', { value: `${formatNumber(target.low, 0, language)}–${formatNumber(target.high ?? target.low, 0, language)}` });
  const low = formatNumber(target.low, 0, language);
  const high = target.high === null ? null : formatNumber(target.high, 0, language);
  const range = high === null ? `${low}+` : `${low}–${high}`;
  return c.id === 'restingHr' ? `${range} ${t('unit.bpm')}` : range;
}

export function targetBasis(c: Contributor, t: TFunction): string {
  if (c.target.kind === 'range') return t(`health.contrib.basis.${c.target.basis}`);
  return t(`health.contrib.target.${c.targetReason ?? 'none-published'}`);
}

export function contributorReason(c: Contributor, t: TFunction): string {
  return c.reason === null ? t('why.noNumber') : t(`health.contrib.reason.${c.reason}`);
}

export function contributorTone(c: Contributor): ChipTone {
  if (c.status === null) return 'neutral';
  if (c.id === 'restingHr') return c.status === 'above' ? 'warning' : 'positive';
  if (c.status === 'below') return 'warning';
  if (c.status === 'above' && c.id === 'sleepHours') return 'warning';
  return 'positive';
}

export function zoneTone(c: Contributor, zone: ScaleZone): ChipTone {
  if (c.id === 'restingHr') return zone === 'above' ? 'warning' : zone === 'below' ? 'info' : 'positive';
  if (zone === 'below') return 'negative';
  if (zone === 'target') return 'positive';
  return c.id === 'sleepHours' ? 'warning' : 'neutral';
}

export function contributorStatus(c: Contributor, t: TFunction): string | null {
  if (c.value === null) return null;
  if (c.status === null) return t('health.contrib.status.none');
  if (c.target.kind === 'range' && c.target.basis === 'own') return t(`health.contrib.statusOwn.${c.status}`);
  return t(`health.contrib.status.${c.status}`);
}

export function contributorSource(id: ContributorId, customZones: boolean): TranslationKey {
  if (customZones && id === 'moderateVigorous') return 'health.contrib.moderateVigorous.sourceCustom';
  if (customZones && id === 'zones45') return 'health.contrib.zones45.sourceCustom';
  return `health.contrib.${id}.source`;
}
