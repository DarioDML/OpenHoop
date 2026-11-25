import type { DayRecord } from '@openhoop/core';

import { baselineAt, percentFromBaseline, rangeStatus } from '@/data/derived';
import { formatHm, formatMinutes, planBedtime } from '@/data/dailyDerived';
import type { TFunction } from '@/i18n/useT';
import { readinessBand } from '@/ui/theme';
import { formatDuration, formatNumber } from '@/lib/format';
import type { Language } from '@/data/types';

export interface BriefLine {
  id: string;
  text: string;
}

export interface Bedtime {
  bed: string;
  wake: string;
  need: string;
}

export function tonightBedtime(days: readonly DayRecord[], index: number): Bedtime | null {
  const day = days[index];
  const need = day?.sleep.need.value ?? null;
  if (!day || need === null) return null;
  const plan = planBedtime(days, index, need);
  if (!plan) return null;
  return { bed: formatMinutes(plan.bedMinutes), wake: formatMinutes(plan.wakeMinutes), need: formatHm(need) };
}

export function briefLines(t: TFunction, language: Language, days: readonly DayRecord[], index: number): BriefLine[] {
  const day = days[index];
  if (!day) return [];
  const lines: BriefLine[] = [];

  const readiness = day.readiness.value;
  const band = readinessBand(readiness);
  if (readiness !== null && band !== null) {
    lines.push({
      id: 'readiness',
      text: t(day.readinessCalibrating ? 'brief.readinessCalibrating' : 'brief.readiness', { band: t(`readiness.${band}`), value: Math.round(readiness) }),
    });
  }

  const hrv = day.hrv.value;
  if (hrv !== null) {
    const baseline = baselineAt(days, index, 'hrv');
    const status = rangeStatus(hrv, baseline);
    const pct = percentFromBaseline(hrv, baseline);
    const value = formatNumber(hrv, 0, language);
    if (baseline && status && pct !== null) {
      lines.push({
        id: 'hrv',
        text: t(`brief.hrv.${status}`, {
          value,
          pct: Math.abs(Math.round(pct)),
          low: formatNumber(baseline.low, 0, language),
          high: formatNumber(baseline.high, 0, language),
        }),
      });
    } else {
      lines.push({ id: 'hrv', text: t('brief.hrv.nobaseline', { value }) });
    }
  }

  const asleep = day.sleep.asleepS;
  if (asleep !== null) {
    const need = day.sleep.need.value;
    lines.push({
      id: 'sleep',
      text:
        need === null
          ? t('brief.sleepOnly', { asleep: formatDuration(t, asleep) })
          : t('brief.sleep', { asleep: formatDuration(t, asleep), need: formatDuration(t, need) }),
    });
  }

  const debt = day.sleep.debt.value;
  if (debt !== null && debt >= 15 * 60) lines.push({ id: 'debt', text: t('brief.debt', { debt: formatDuration(t, debt) }) });

  const bedtime = tonightBedtime(days, index);
  if (bedtime) lines.push({ id: 'bedtime', text: t('brief.bedtime', { bed: bedtime.bed, wake: bedtime.wake, need: bedtime.need }) });

  return lines;
}

export function eveningLines(t: TFunction, language: Language, days: readonly DayRecord[], index: number, stepsGoal: number | null): BriefLine[] {
  const day = days[index];
  if (!day) return [];
  const lines: BriefLine[] = [];

  const load = day.load.value;
  if (load !== null) {
    const recent = days
      .slice(Math.max(0, index - 7), index)
      .map((d) => d.load.value)
      .filter((v): v is number => v !== null);
    const average = recent.length >= 3 ? recent.reduce((sum, v) => sum + v, 0) / recent.length : null;
    lines.push({
      id: 'load',
      text:
        average === null
          ? t('brief.load', { value: formatNumber(load, 1, language) })
          : t('brief.loadAvg', { value: formatNumber(load, 1, language), avg: formatNumber(average, 1, language) }),
    });
  }

  if (day.steps !== null) {
    lines.push({
      id: 'steps',
      text:
        stepsGoal === null
          ? t('brief.steps', { steps: formatNumber(day.steps, 0, language) })
          : t('brief.stepsGoal', { steps: formatNumber(day.steps, 0, language), goal: formatNumber(stepsGoal, 0, language) }),
    });
  }

  if (day.workouts.length > 0) lines.push({ id: 'workouts', text: t('brief.workouts', { count: day.workouts.length }) });

  const bedtime = tonightBedtime(days, index);
  if (bedtime) lines.push({ id: 'bedtime', text: t('brief.bedtime', { bed: bedtime.bed, wake: bedtime.wake, need: bedtime.need }) });

  return lines;
}
