import { isRecord, type Json } from '@/lib/json';

export const COACH_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'] as const;
export type CoachModel = (typeof COACH_MODELS)[number];
export const DEFAULT_COACH_MODEL: CoachModel = 'claude-sonnet-5-5';

const MAX_DISMISSED = 60;
const CHECK_IN_ID = /^\d{4}-\d{2}-\d{2}:[a-zA-Z]{1,20}$/;

export interface CoachPrefs {
  model: CoachModel;
  memory: boolean;
  checkIns: boolean;
  dismissedCheckIns: string[];
}

export function defaultCoachPrefs(): CoachPrefs {
  return { model: DEFAULT_COACH_MODEL, memory: true, checkIns: false, dismissedCheckIns: [] };
}

export function isCoachModel(value: Json | undefined): value is CoachModel {
  return typeof value === 'string' && (COACH_MODELS as readonly string[]).includes(value);
}

export function isCheckInId(value: Json | undefined): value is string {
  return typeof value === 'string' && CHECK_IN_ID.test(value);
}

export function parseCoachPrefs(value: Json | undefined): CoachPrefs {
  const prefs = defaultCoachPrefs();
  if (!isRecord(value)) return prefs;
  if (isCoachModel(value.model)) prefs.model = value.model;
  if (typeof value.memory === 'boolean') prefs.memory = value.memory;
  prefs.checkIns = value.checkIns === true;
  if (Array.isArray(value.dismissedCheckIns)) {
    const ids = value.dismissedCheckIns.filter(isCheckInId);
    prefs.dismissedCheckIns = [...new Set(ids)].slice(-MAX_DISMISSED);
  }
  return prefs;
}

export function withDismissed(prefs: CoachPrefs, id: string): CoachPrefs {
  if (prefs.dismissedCheckIns.includes(id)) return prefs;
  return { ...prefs, dismissedCheckIns: [...prefs.dismissedCheckIns, id].slice(-MAX_DISMISSED) };
}
