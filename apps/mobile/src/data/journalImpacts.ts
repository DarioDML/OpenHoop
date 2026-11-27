import type { DayRecord } from '@openhoop/core';

import type { TranslationKey } from '@/i18n';

import { mean, stdev, type MetricKey } from './derived';
import { MIN_DAYS_PER_SIDE, behaviourSamples, compareBehaviour } from './healthDerived';
import type { JournalQuestion } from './journalQuestions';
import type { JournalAnswer } from './userData';

export type ImpactConfidence = 'high' | 'medium' | 'low';

export interface BehaviourImpact {
  questionId: string;
  effectPct: number;
  withAvg: number;
  withoutAvg: number;
  nWith: number;
  nWithout: number;
  confidence: ImpactConfidence;
}

export interface UnderLogged {
  questionId: string;
  side: 'with' | 'without';
  have: number;
  need: number;
}

export interface BehaviourImpacts {
  ranked: BehaviourImpact[];
  needsMore: UnderLogged[];
}

export const HIGH_CONFIDENCE_DAYS = 10;
const HIGH_CONFIDENCE_T = 2;
const MEDIUM_CONFIDENCE_T = 1;

/** Welch's t of the two groups: how far apart the averages are relative to their spread. */
export function impactConfidence(withValues: readonly number[], withoutValues: readonly number[]): ImpactConfidence {
  const withAvg = mean(withValues);
  const withoutAvg = mean(withoutValues);
  if (withAvg === null || withoutAvg === null) return 'low';
  const sdWith = stdev(withValues) ?? 0;
  const sdWithout = stdev(withoutValues) ?? 0;
  const se = Math.sqrt((sdWith * sdWith) / withValues.length + (sdWithout * sdWithout) / withoutValues.length);
  const gap = Math.abs(withAvg - withoutAvg);
  const t = se === 0 ? (gap === 0 ? 0 : Number.POSITIVE_INFINITY) : gap / se;
  if (t >= HIGH_CONFIDENCE_T && Math.min(withValues.length, withoutValues.length) >= HIGH_CONFIDENCE_DAYS) return 'high';
  if (t >= MEDIUM_CONFIDENCE_T) return 'medium';
  return 'low';
}

export function rankBehaviourImpacts(
  days: readonly DayRecord[],
  journal: Record<string, Record<string, JournalAnswer>>,
  questions: readonly JournalQuestion[],
  metric: MetricKey = 'readiness',
  minDays = MIN_DAYS_PER_SIDE,
): BehaviourImpacts {
  const ranked: BehaviourImpact[] = [];
  const needsMore: UnderLogged[] = [];
  for (const question of questions) {
    const comparison = compareBehaviour(days, journal, question.id, metric, minDays);
    if (!comparison.enough) {
      const side = comparison.nWith < minDays ? 'with' : 'without';
      needsMore.push({ questionId: question.id, side, have: side === 'with' ? comparison.nWith : comparison.nWithout, need: minDays });
      continue;
    }
    if (comparison.withAvg === null || comparison.withoutAvg === null || comparison.deltaPct === null) continue;
    const samples = behaviourSamples(days, journal, question.id, metric);
    ranked.push({
      questionId: question.id,
      effectPct: comparison.deltaPct,
      withAvg: comparison.withAvg,
      withoutAvg: comparison.withoutAvg,
      nWith: comparison.nWith,
      nWithout: comparison.nWithout,
      confidence: impactConfidence(samples.withValues, samples.withoutValues),
    });
  }
  ranked.sort((a, b) => b.effectPct - a.effectPct);
  return { ranked, needsMore };
}

const BEHAVIOUR_NAMES: Readonly<Record<string, TranslationKey>> = {
  alcohol: 'readinessImpacts.b.alcohol',
  'caffeine-late': 'readinessImpacts.b.caffeineLate',
  'screens-bed': 'readinessImpacts.b.screensBed',
  'read-before-sleep': 'readinessImpacts.b.readBeforeSleep',
  sauna: 'readinessImpacts.b.sauna',
  melatonin: 'readinessImpacts.b.melatonin',
  'late-meal': 'readinessImpacts.b.lateMeal',
  'evening-workout': 'readinessImpacts.b.eveningWorkout',
  nap: 'readinessImpacts.b.nap',
  'high-stress': 'readinessImpacts.b.highStress',
  water: 'readinessImpacts.b.water',
  outdoors: 'readinessImpacts.b.outdoors',
};

export function behaviourName(question: JournalQuestion): TranslationKey {
  return BEHAVIOUR_NAMES[question.id] ?? question.labelKey;
}
