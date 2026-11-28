import { addDays, weekStart } from './derived';
import { answerIsYes } from './healthDerived';
import { isoWeekNumber } from './loadDerived';
import type { JournalAnswer } from './userData';

export type Journal = Readonly<Record<string, Readonly<Record<string, JournalAnswer>>>>;

export interface BehaviourStats {
  streak: number;
  thisMonth: number;
  best: number;
  logged: number;
  answered: number;
}

export interface WeekCount {
  weekStart: string;
  week: number;
  count: number;
  answered: number;
}

export type DayMark = 'yes' | 'no' | 'none';

function yesOn(journal: Journal, id: string, day: string): boolean | null {
  return answerIsYes(journal[day]?.[id]);
}

export function behaviourStats(journal: Journal, id: string, today: string): BehaviourStats {
  let streak = 0;
  let cursor = yesOn(journal, id, today) === null ? addDays(today, -1) : today;
  while (yesOn(journal, id, cursor) === true) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const month = today.slice(0, 7);
  const days = Object.keys(journal)
    .filter((day) => day <= today && yesOn(journal, id, day) !== null)
    .sort();
  const yesDays = days.filter((day) => yesOn(journal, id, day) === true);

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of yesDays) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  return {
    streak,
    thisMonth: yesDays.filter((day) => day.startsWith(month)).length,
    best,
    logged: yesDays.length,
    answered: days.length,
  };
}

export function dayMark(journal: Journal, id: string, day: string): DayMark {
  const yes = yesOn(journal, id, day);
  return yes === null ? 'none' : yes ? 'yes' : 'no';
}

export function weeklyCounts(journal: Journal, id: string, today: string, weeks = 4): WeekCount[] {
  const current = weekStart(today);
  const out: WeekCount[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(current, -7 * w);
    let count = 0;
    let answered = 0;
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, d);
      if (day > today) break;
      const yes = yesOn(journal, id, day);
      if (yes !== null) answered += 1;
      if (yes === true) count += 1;
    }
    out.push({ weekStart: start, week: isoWeekNumber(start), count, answered });
  }
  return out;
}

export function earliestAnswer(journal: Journal, id: string): string | null {
  const days = Object.keys(journal)
    .filter((day) => yesOn(journal, id, day) !== null)
    .sort();
  return days[0] ?? null;
}
