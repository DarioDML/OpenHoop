import type { BandModel, BodyMeasurement, CycleData, DayRecord, EcgSummary, LabResult } from '@openhoop/core';

import { bodyAgeHeadline, latestFitnessAge, latestPhenoAge, yearsDifference, type BodyAgeHeadline } from '@/data/bodyAgeDerived';
import { sortMeasurements } from '@/data/bodyComposition';
import { computeCycleStats, dayOfCycle, estimateNextPeriod } from '@/data/cycle';
import { latestVitalsIndex, vitalReadings, vitalsSummary } from '@/data/healthDerived';
import { VO2_MIN_NIGHTS, VO2_WINDOW_NIGHTS, fitnessLevel, latestVo2 } from '@/data/healthspanDerived';
import { rangeStatus, summarizeBiomarkers } from '@/data/labs';
import { buildingProgress, remaining } from '@/data/progress';
import { latestStressDayIndex, stressForDay } from '@/data/stressDerived';
import type { Language, Profile, Units } from '@/data/types';
import type { UserData } from '@/data/userData';
import type { TFunction } from '@/i18n/useT';
import { formatClock, formatNumber, formatShortDay, todayIso } from '@/lib/format';
import { formatWeight } from '@/lib/units';

export interface HubTileText {
  value: string | null;
  missing?: string;
  caption?: string;
}

export interface HubInput {
  days: readonly DayRecord[];
  profile: Profile;
  userData: UserData;
  labResults: readonly LabResult[];
  bodyMeasurements: readonly BodyMeasurement[];
  cycle: CycleData;
  ecgRecordings: readonly EcgSummary[];
  model: BandModel | null;
  units: Units;
  today: string;
}

interface Text {
  t: TFunction;
  language: Language;
}

export function bodyAgeCaption(headline: BodyAgeHeadline, { t, language }: Text): string {
  if (headline.kind === 'none') return t(`health.hub.tile.bodyAgeWhy.${headline.reason}`);
  const diff = yearsDifference(headline);
  if (diff === null) return t(`health.bodyAge.sourceShort.${headline.source}`);
  const years = formatNumber(Math.abs(diff), 1, language);
  const gap = Number(years.replace(',', '.')) === 0 ? t('health.hub.tile.bodyAgeSame') : diff > 0 ? t('health.hub.tile.bodyAgeYounger', { years }) : t('health.hub.tile.bodyAgeOlder', { years });
  return `${t(`health.hub.tile.bodyAgeSource.${headline.source}`)} · ${gap}`;
}

export function bodyAgeMissing(headline: BodyAgeHeadline, t: TFunction): string {
  if (headline.kind === 'bound') return t(headline.direction === 'younger-than' ? 'health.bodyAge.fitness.below' : 'health.bodyAge.fitness.above', { age: Math.round(headline.age) });
  if (headline.kind === 'none') return t(`health.bodyAge.none.${headline.reason}`);
  return '';
}

function bodyAgeTile(input: HubInput, text: Text): HubTileText {
  const headline = bodyAgeHeadline(latestFitnessAge(input.days, input.profile, input.userData.sex), latestPhenoAge(input.labResults, input.profile));
  if (headline.kind === 'age') return { value: formatNumber(headline.age, 1, text.language), caption: bodyAgeCaption(headline, text) };
  const missing = headline.kind === 'none' ? text.t('health.hub.tile.noEstimate') : bodyAgeMissing(headline, text.t);
  return { value: null, missing, caption: bodyAgeCaption(headline, text) };
}

function vitalsTile(input: HubInput, { t }: Text): HubTileText {
  const index = latestVitalsIndex(input.days);
  const summary = vitalsSummary(index >= 0 ? vitalReadings(input.days, index) : []);
  if (summary.judged > 0) return { value: `${summary.within}/${summary.judged}`, caption: t('health.hub.tile.vitalsWithin') };
  if (summary.measured === 0) return { value: null, missing: t('health.hub.tile.noVitals'), caption: t('health.hub.tile.noVitalsHint') };
  const progress = buildingProgress('normalRange', input.days, index);
  return {
    value: null,
    missing: t('health.hub.tile.calibrating'),
    caption: progress === null ? t('health.hub.tile.calibratingHint') : t('health.hub.tile.nightsLeft', { count: remaining(progress) }),
  };
}

function stressTile(input: HubInput, { t, language }: Text): HubTileText {
  const day = input.days[latestStressDayIndex(input.days)];
  const view = stressForDay(day);
  if (view.latest !== null && day !== undefined) {
    return {
      value: formatNumber(view.latest.score, 1, language),
      caption: `${t(`stress.level.${view.latest.level}`)} · ${formatClock(view.latest.t, day.tzOffsetS)}`,
    };
  }
  if (view.calibrating) return { value: null, missing: t('health.hub.tile.calibrating'), caption: t('health.hub.tile.stressDays', { have: view.baselineDays, need: view.neededDays }) };
  return { value: null, missing: t('health.hub.tile.noStress'), caption: t('health.hub.tile.noStressHint') };
}

function ecgTile(input: HubInput, { t, language }: Text): HubTileText {
  const last = input.ecgRecordings.reduce<EcgSummary | null>((newest, rec) => (newest === null || rec.t > newest.t ? rec : newest), null);
  if (last !== null) {
    return {
      value: `${input.ecgRecordings.length}`,
      caption: t('health.hub.tile.ecgLast', { day: formatShortDay(todayIso(new Date(last.t * 1000)), language) }),
    };
  }
  if (input.model !== 'MG') return { value: null, missing: t('health.hub.tile.ecgNeedsMg'), caption: t('health.hub.tile.ecgTrace') };
  return { value: null, missing: t('health.hub.tile.ecgNone'), caption: t('health.hub.tile.ecgTrace') };
}

function cycleTile(input: HubInput, { t }: Text): HubTileText {
  const stats = computeCycleStats(input.cycle.periods);
  const day = dayOfCycle(stats, input.today);
  if (stats.periodCount === 0) return { value: null, missing: t('health.hub.tile.cycleNone'), caption: t('health.hub.tile.cycleNoneHint') };
  if (day === null) return { value: null, missing: t('health.hub.tile.cycleNoRecent'), caption: t('health.hub.tile.cycleNoneHint') };
  const next = estimateNextPeriod(stats, input.today);
  const caption = next.ok && next.daysUntil >= 0 ? t('health.hub.tile.cycleNext', { days: next.daysUntil }) : t('health.hub.tile.cycleNeedsHistory');
  return { value: t('health.hub.tile.cycleDay', { day }), caption };
}

function labsTile(input: HubInput, { t }: Text): HubTileText {
  const summaries = summarizeBiomarkers(input.labResults);
  const judged = summaries.map((s) => rangeStatus(s.latest)).filter((status) => status !== null);
  if (judged.length > 0) return { value: `${judged.filter((s) => s === 'inside').length}/${judged.length}`, caption: t('health.hub.tile.labsInside') };
  if (summaries.length > 0) return { value: `${summaries.length}`, caption: t('health.hub.tile.labsEntered') };
  return { value: null, missing: t('health.hub.tile.labsNone'), caption: t('health.hub.tile.labsNoneHint') };
}

function vo2Tile(input: HubInput, { t, language }: Text): HubTileText {
  const view = latestVo2(input.days, input.profile, input.userData.sex);
  if (!view.result.ok) {
    return {
      value: null,
      missing: t('health.hub.tile.vo2None'),
      caption: t(`health.vo2max.short.${view.result.reason}`, { min: VO2_MIN_NIGHTS, window: VO2_WINDOW_NIGHTS, nights: view.result.nights }),
    };
  }
  const { vo2max } = view.result.value;
  const caption = view.norm !== null ? t(`health.hub.tile.vo2Level.${fitnessLevel(vo2max, view.norm.norm).level}`) : t(`health.vo2max.short.norm.${view.normReason ?? 'no-age'}`);
  return { value: formatNumber(vo2max, 0, language), caption };
}

function bodyTile(input: HubInput, { t, language }: Text): HubTileText {
  const sorted = sortMeasurements(input.bodyMeasurements);
  const latest = sorted[sorted.length - 1];
  if (latest !== undefined) {
    const weight = formatWeight(latest.weightKg, input.units, language);
    return {
      value: `${weight.value} ${weight.unit}`,
      caption: latest.source === 'health_connect' ? t('health.hub.tile.bodyFromHc') : t('health.hub.tile.bodyManual', { day: formatShortDay(latest.day, language) }),
    };
  }
  if (input.userData.weightKg !== null) {
    const weight = formatWeight(input.userData.weightKg, input.units, language);
    return { value: `${weight.value} ${weight.unit}`, caption: t('health.hub.tile.bodyProfile') };
  }
  return { value: null, missing: t('health.hub.tile.bodyNone'), caption: t('health.hub.tile.bodyNoneHint') };
}

export const HUB_TILE_IDS = ['bodyAge', 'vitals', 'stress', 'ecg', 'cycle', 'labs', 'vo2max', 'body'] as const;
export type HubTileId = (typeof HUB_TILE_IDS)[number];

export function hubTileText(id: HubTileId, input: HubInput, text: Text): HubTileText {
  switch (id) {
    case 'bodyAge':
      return bodyAgeTile(input, text);
    case 'vitals':
      return vitalsTile(input, text);
    case 'stress':
      return stressTile(input, text);
    case 'ecg':
      return ecgTile(input, text);
    case 'cycle':
      return cycleTile(input, text);
    case 'labs':
      return labsTile(input, text);
    case 'vo2max':
      return vo2Tile(input, text);
    case 'body':
      return bodyTile(input, text);
  }
}
