import { defaultCoachPrefs, parseCoachPrefs, type CoachPrefs } from '@/coach/prefs';
import { isRecord, type Json } from '@/lib/json';
import { defaultNetworkPrefs, parseNetworkPrefs, type NetworkPrefs } from '@/net/features';

export const USER_DATA_KEY = 'user.data';

export type Sex = 'female' | 'male' | 'other';
export type HomeHero = 'classic' | 'compact';
export type JournalAnswer = boolean | number;

export const DASHBOARD_TILES = ['hrv', 'restingHr', 'steps', 'respiratoryRate', 'spo2', 'skinTemp', 'sleepDebt', 'calories'] as const;
export type DashboardTile = (typeof DASHBOARD_TILES)[number];

export const HOME_SECTIONS = ['summary', 'brief', 'coach', 'live', 'myDay', 'week', 'tonight', 'dashboard'] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

export const GOALS = ['sleep', 'recovery', 'fitness', 'stress', 'health', 'performance'] as const;
export type Goal = (typeof GOALS)[number];

export interface NotificationPrefs {
  enabled: boolean;
  morningDigest: boolean;
  syncProblems: boolean;
  quietStart: string;
  quietEnd: string;
}

export interface UserData {
  name: string | null;
  heightCm: number | null;
  weightKg: number | null;
  sex: Sex | null;
  goals: Goal[];
  stepsGoal: number | null;
  onboardingDone: boolean;
  homeHero: HomeHero;
  dashboardTiles: DashboardTile[];
  previousDashboardTiles: DashboardTile[] | null;
  homeSections: HomeSection[];
  previousHomeSections: HomeSection[] | null;
  notifications: NotificationPrefs;
  journalQuestions: string[] | null;
  journal: Record<string, Record<string, JournalAnswer>>;
  weeklyPlan: { loadDays: number; sleepNights: number } | null;
  network: NetworkPrefs;
  coach: CoachPrefs;
}

export const DEFAULT_DASHBOARD: DashboardTile[] = ['hrv', 'restingHr', 'steps', 'respiratoryRate'];

export function defaultUserData(): UserData {
  return {
    name: null,
    heightCm: null,
    weightKg: null,
    sex: null,
    goals: [],
    stepsGoal: null,
    onboardingDone: false,
    homeHero: 'classic',
    dashboardTiles: [...DEFAULT_DASHBOARD],
    previousDashboardTiles: null,
    homeSections: [...HOME_SECTIONS],
    previousHomeSections: null,
    notifications: { enabled: false, morningDigest: true, syncProblems: true, quietStart: '22:00', quietEnd: '07:00' },
    journalQuestions: null,
    journal: {},
    weeklyPlan: null,
    network: defaultNetworkPrefs(),
    coach: defaultCoachPrefs(),
  };
}

function numberIn(value: Json | undefined, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function textOrNull(value: Json | undefined, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, maxLength);
}

function oneOf<T extends string>(value: Json | undefined, options: readonly T[]): T | null {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : null;
}

function listOf<T extends string>(value: Json | undefined, options: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    const picked = oneOf(item, options);
    if (picked !== null && !out.includes(picked)) out.push(picked);
  }
  return out;
}

function stringList(value: Json | undefined, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => textOrNull(item, maxLength))
    .filter((item): item is string => item !== null)
    .slice(0, maxItems);
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9-]{1,40}$/;

function clockOr(value: Json | undefined, fallback: string): string {
  return typeof value === 'string' && CLOCK.test(value) ? value : fallback;
}

function parseJournal(value: Json | undefined): UserData['journal'] {
  if (!isRecord(value)) return {};
  const out: UserData['journal'] = {};
  for (const [day, answers] of Object.entries(value)) {
    if (!ISO_DAY.test(day) || !isRecord(answers)) continue;
    const entry: Record<string, JournalAnswer> = {};
    for (const [question, answer] of Object.entries(answers)) {
      if (!ID.test(question)) continue;
      if (typeof answer === 'boolean') entry[question] = answer;
      else if (typeof answer === 'number' && Number.isFinite(answer) && answer >= 0 && answer <= 1000) entry[question] = answer;
    }
    out[day] = entry;
  }
  return out;
}

export function parseUserData(raw: string | null): UserData {
  const base = defaultUserData();
  if (raw === null || raw === '') return base;
  let parsed: Json;
  try {
    parsed = JSON.parse(raw) as Json;
  } catch {
    return base;
  }
  if (!isRecord(parsed)) return base;
  const notifications = isRecord(parsed.notifications) ? parsed.notifications : {};
  const tiles = listOf(parsed.dashboardTiles, DASHBOARD_TILES);
  const previous = Array.isArray(parsed.previousDashboardTiles) ? listOf(parsed.previousDashboardTiles, DASHBOARD_TILES) : null;
  const sections = listOf(parsed.homeSections, HOME_SECTIONS);
  const previousSections = Array.isArray(parsed.previousHomeSections) ? listOf(parsed.previousHomeSections, HOME_SECTIONS) : null;
  const plan = isRecord(parsed.weeklyPlan) ? parsed.weeklyPlan : null;
  const loadDays = plan ? numberIn(plan.loadDays, 0, 7) : null;
  const sleepNights = plan ? numberIn(plan.sleepNights, 0, 7) : null;
  return {
    name: textOrNull(parsed.name, 40),
    heightCm: numberIn(parsed.heightCm, 80, 250),
    weightKg: numberIn(parsed.weightKg, 25, 300),
    sex: oneOf(parsed.sex, ['female', 'male', 'other'] as const),
    goals: listOf(parsed.goals, GOALS),
    stepsGoal: numberIn(parsed.stepsGoal, 1000, 50000),
    onboardingDone: parsed.onboardingDone === true,
    homeHero: oneOf(parsed.homeHero, ['classic', 'compact'] as const) ?? base.homeHero,
    dashboardTiles: tiles.length > 0 ? tiles : base.dashboardTiles,
    previousDashboardTiles: previous && previous.length > 0 ? previous : null,
    homeSections: Array.isArray(parsed.homeSections) ? sections : base.homeSections,
    previousHomeSections: previousSections,
    notifications: {
      enabled: notifications.enabled === true,
      morningDigest: typeof notifications.morningDigest === 'boolean' ? notifications.morningDigest : base.notifications.morningDigest,
      syncProblems: typeof notifications.syncProblems === 'boolean' ? notifications.syncProblems : base.notifications.syncProblems,
      quietStart: clockOr(notifications.quietStart, base.notifications.quietStart),
      quietEnd: clockOr(notifications.quietEnd, base.notifications.quietEnd),
    },
    journalQuestions: Array.isArray(parsed.journalQuestions) ? stringList(parsed.journalQuestions, 40, 40).filter((id) => ID.test(id)) : null,
    journal: parseJournal(parsed.journal),
    weeklyPlan: loadDays !== null && sleepNights !== null ? { loadDays, sleepNights } : null,
    network: parseNetworkPrefs(parsed.network),
    coach: parseCoachPrefs(parsed.coach),
  };
}

export function serializeUserData(data: UserData): string {
  return JSON.stringify(data);
}

export function initialOf(name: string | null): string | null {
  if (name === null) return null;
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : null;
}
