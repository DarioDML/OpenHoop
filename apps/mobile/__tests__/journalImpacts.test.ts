import type { DayRecord } from '@openhoop/core';

import { addDays } from '@/data/derived';
import { createFixtureDays } from '@/data/fixtureSource';
import { JOURNAL_QUESTIONS, findQuestion } from '@/data/journalQuestions';
import { behaviourName, impactConfidence, rankBehaviourImpacts } from '@/data/journalImpacts';
import type { JournalAnswer } from '@/data/userData';

const base = createFixtureDays(new Date('2026-11-25T12:00:00Z'));

function withReadiness(values: readonly number[], start: string): DayRecord[] {
  const template = base[base.length - 1];
  if (template === undefined) throw new Error('fixture has no days');
  return values.map((value, i) => ({
    ...template,
    day: addDays(start, i),
    readiness: { ...template.readiness, value, reason: null },
    readinessCalibrating: false,
  }));
}

describe('journal impacts', () => {
  const days = withReadiness(Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 50 + (i % 3) : 70 + (i % 3))), '2026-10-01');
  const journal: Record<string, Record<string, JournalAnswer>> = {};
  days.forEach((d, i) => {
    const prev = addDays(d.day, -1);
    journal[prev] = { sauna: i % 2 === 1, alcohol: i % 2 === 0 ? 2 : 0 };
  });
  journal['2026-10-02'] = { ...journal['2026-10-02'], 'late-meal': true };

  it('ranks behaviours from most helpful to most harmful', () => {
    const questions = JOURNAL_QUESTIONS.filter((q) => ['alcohol', 'sauna', 'late-meal'].includes(q.id));
    const { ranked, needsMore } = rankBehaviourImpacts(days, journal, questions);
    expect(ranked.map((r) => r.questionId)).toEqual(['sauna', 'alcohol']);
    expect(ranked[0]?.effectPct).toBeGreaterThan(0);
    expect(ranked[1]?.effectPct).toBeLessThan(0);
    expect(ranked[0]?.confidence).toBe('high');
    expect(needsMore).toEqual([{ questionId: 'late-meal', side: 'with', have: 1, need: 5 }]);
  });

  it('asks for days without a behaviour when it was always done', () => {
    const always: Record<string, Record<string, JournalAnswer>> = {};
    days.slice(0, 8).forEach((d) => {
      always[addDays(d.day, -1)] = { sauna: true };
    });
    const sauna = findQuestion('sauna');
    if (sauna === undefined) throw new Error('missing question');
    expect(rankBehaviourImpacts(days, always, [sauna]).needsMore).toEqual([{ questionId: 'sauna', side: 'without', have: 0, need: 5 }]);
  });

  it('leaves out behaviours that were never logged', () => {
    const sauna = findQuestion('sauna');
    if (sauna === undefined) throw new Error('missing question');
    expect(rankBehaviourImpacts(days, {}, [sauna]).needsMore).toEqual([]);
  });

  it('grades confidence by group size and spread', () => {
    expect(impactConfidence([60, 61, 59, 60, 60], [60, 59, 61, 60, 60])).toBe('low');
    expect(impactConfidence([70, 72, 68, 71, 69], [60, 62, 58, 61, 59])).toBe('medium');
    expect(impactConfidence(Array.from({ length: 10 }, (_, i) => 70 + (i % 3)), Array.from({ length: 10 }, (_, i) => 60 + (i % 3)))).toBe('high');
    expect(impactConfidence([], [60])).toBe('low');
  });

  it('has a short name for every question', () => {
    for (const question of JOURNAL_QUESTIONS) expect(behaviourName(question)).toBe(question.nameKey);
    const alcohol = findQuestion('alcohol');
    expect(alcohol && behaviourName(alcohol)).toBe('readinessImpacts.b.alcohol');
  });
});
