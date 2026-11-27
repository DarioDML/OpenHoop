import type { ActivityRow, DayRecord, StrengthSession } from '@openhoop/core';

import { deviceTzOffsetS } from '@/lib/dates';
import type { HcStepsDay } from '@/lib/healthConnectMapping';

import { mergeSteps } from './activityDerived';
import type { PlanInput } from './weeklyPlan';

export function planInputFor(
  days: readonly DayRecord[],
  sessions: readonly StrengthSession[],
  activities: readonly ActivityRow[],
  imported: readonly HcStepsDay[],
  today: string,
  now: Date,
): PlanInput {
  return { days, sessions, activities, steps: mergeSteps(days, imported), today, nowS: Math.floor(now.getTime() / 1000), tzOffsetS: deviceTzOffsetS(now) };
}
