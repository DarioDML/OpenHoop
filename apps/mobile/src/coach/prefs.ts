import { isRecord, type Json } from '@/lib/json';
import { featureEnabled, type NetworkPrefs } from '@/net/features';

export const COACH_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'] as const;
export type CoachModel = (typeof COACH_MODELS)[number];
export const DEFAULT_COACH_MODEL: CoachModel = 'claude-sonnet-5-5';

export const COACH_TONES = ['neutral', 'encouraging', 'direct'] as const;
export type CoachTone = (typeof COACH_TONES)[number];

export const COACH_PROACTIVITY = ['off', 'weekly', 'patterns'] as const;
export type CoachProactivity = (typeof COACH_PROACTIVITY)[number];

export const MEMORY_CATEGORIES = ['goals', 'lifestyle', 'preferences', 'events', 'other'] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const CHECK_IN_REPLIES = ['sick', 'tired', 'travelling', 'later'] as const;
export type CheckInReplyKind = (typeof CHECK_IN_REPLIES)[number];

export interface CoachAccess {
  scores: boolean;
  journal: boolean;
  sensors: boolean;
}

export interface CheckInReply {
  id: string;
  reply: CheckInReplyKind;
  conversationId: number | null;
}

const MAX_DISMISSED = 60;
const MAX_CATEGORIES = 60;
const MAX_REPLIES = 30;
const CHECK_IN_ID = /^\d{4}-\d{2}-\d{2}:[a-zA-Z]{1,20}$/;
const MEMORY_KEY = /^\d{1,12}@\d{1,12}$/;

export interface CoachPrefs {
  model: CoachModel;
  memory: boolean;
  checkIns: boolean;
  dismissedCheckIns: string[];
  enabled: boolean;
  tone: CoachTone;
  proactivity: CoachProactivity;
  access: CoachAccess;
  memoryCategories: Record<string, MemoryCategory>;
  checkInReplies: CheckInReply[];
}

export function defaultCoachAccess(): CoachAccess {
  return { scores: true, journal: false, sensors: false };
}

export function defaultCoachPrefs(): CoachPrefs {
  return {
    model: DEFAULT_COACH_MODEL,
    memory: true,
    checkIns: false,
    dismissedCheckIns: [],
    enabled: true,
    tone: 'neutral',
    proactivity: 'off',
    access: defaultCoachAccess(),
    memoryCategories: {},
    checkInReplies: [],
  };
}

function oneOf<T extends string>(value: Json | undefined, options: readonly T[]): T | null {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : null;
}

export function isCoachModel(value: Json | undefined): value is CoachModel {
  return typeof value === 'string' && (COACH_MODELS as readonly string[]).includes(value);
}

export function isCheckInId(value: Json | undefined): value is string {
  return typeof value === 'string' && CHECK_IN_ID.test(value);
}

function parseAccess(value: Json | undefined): CoachAccess {
  const access = defaultCoachAccess();
  if (!isRecord(value)) return access;
  if (typeof value.scores === 'boolean') access.scores = value.scores;
  if (typeof value.journal === 'boolean') access.journal = value.journal;
  if (typeof value.sensors === 'boolean') access.sensors = value.sensors;
  return access;
}

function parseCategories(value: Json | undefined): Record<string, MemoryCategory> {
  const out: Record<string, MemoryCategory> = {};
  if (!isRecord(value)) return out;
  for (const [key, category] of Object.entries(value).slice(-MAX_CATEGORIES)) {
    const picked = oneOf(category, MEMORY_CATEGORIES);
    if (MEMORY_KEY.test(key) && picked !== null) out[key] = picked;
  }
  return out;
}

function parseReplies(value: Json | undefined): CheckInReply[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, CheckInReply>();
  for (const item of value) {
    if (!isRecord(item) || !isCheckInId(item.id)) continue;
    const reply = oneOf(item.reply, CHECK_IN_REPLIES);
    if (reply === null) continue;
    const conversationId = typeof item.conversationId === 'number' && Number.isInteger(item.conversationId) && item.conversationId > 0 ? item.conversationId : null;
    byId.delete(item.id);
    byId.set(item.id, { id: item.id, reply, conversationId });
  }
  return [...byId.values()].slice(-MAX_REPLIES);
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
  prefs.enabled = value.enabled !== false;
  prefs.tone = oneOf(value.tone, COACH_TONES) ?? 'neutral';
  prefs.proactivity = oneOf(value.proactivity, COACH_PROACTIVITY) ?? (prefs.checkIns ? 'patterns' : 'off');
  prefs.access = parseAccess(value.access);
  prefs.memoryCategories = parseCategories(value.memoryCategories);
  prefs.checkInReplies = parseReplies(value.checkInReplies);
  return prefs;
}

export function withDismissed(prefs: CoachPrefs, id: string): CoachPrefs {
  if (prefs.dismissedCheckIns.includes(id)) return prefs;
  return { ...prefs, dismissedCheckIns: [...prefs.dismissedCheckIns, id].slice(-MAX_DISMISSED) };
}

export function effectiveProactivity(prefs: CoachPrefs): CoachProactivity {
  if (!prefs.checkIns) return 'off';
  return prefs.proactivity === 'off' ? 'patterns' : prefs.proactivity;
}

export function withProactivity(prefs: CoachPrefs, proactivity: CoachProactivity): CoachPrefs {
  return { ...prefs, proactivity, checkIns: proactivity !== 'off' };
}

export function withCheckInsShown(prefs: CoachPrefs, on: boolean): CoachPrefs {
  return withProactivity(prefs, on ? (prefs.proactivity === 'off' ? 'patterns' : prefs.proactivity) : 'off');
}

export function coachActive(prefs: CoachPrefs, network: NetworkPrefs): boolean {
  return prefs.enabled && featureEnabled(network, 'coach');
}

export interface MemoryRef {
  id: number;
  createdAt: number;
  text: string;
}

export function memoryKey(note: Pick<MemoryRef, 'id' | 'createdAt'>): string {
  return `${note.id}@${note.createdAt}`;
}

const CATEGORY_RULES: ReadonlyArray<{ category: MemoryCategory; pattern: RegExp }> = [
  {
    category: 'events',
    pattern:
      /\b(\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mei|mrt|okt)\w*|flight|trip|holiday|vacation|wedding|race on|marathon on|surgery|vlucht|reis|vakantie|bruiloft|operatie|wedstrijd op)\b/i,
  },
  {
    category: 'preferences',
    pattern:
      /\b(prefer|prefers|likes?|dislikes?|rather|short answers|keep it short|(don't|do not|doesn't) (want|like|mention|give|use|talk)|no (calorie|diet|weight|numbers|emoji|jargon|advice|lectures)|liever|houdt van|wil geen|niet graag|geen (calorie|dieet|gewicht|cijfers|emoji|jargon|advies))/i,
  },
  { category: 'goals', pattern: /\b(goal|aim|want to|wants to|target|plan to|training for|sub-?\d|pr\b|doel|wil graag|streef|trainen voor)/i },
  { category: 'lifestyle', pattern: /\b(work|works|job|desk|shift|commute|trains|sleeps|kids|children|vegetarian|vegan|werk|werkt|bureau|ploeg|kinderen|slaapt|traint|vegetari)/i },
];

export function guessMemoryCategory(text: string): MemoryCategory {
  for (const rule of CATEGORY_RULES) if (rule.pattern.test(text)) return rule.category;
  return 'other';
}

export function memoryCategoryOf(prefs: CoachPrefs, note: MemoryRef): MemoryCategory {
  return prefs.memoryCategories[memoryKey(note)] ?? guessMemoryCategory(note.text);
}

export function withMemoryCategory(prefs: CoachPrefs, note: Pick<MemoryRef, 'id' | 'createdAt'>, category: MemoryCategory, notes: ReadonlyArray<Pick<MemoryRef, 'id' | 'createdAt'>>): CoachPrefs {
  const keep = new Set([...notes.map(memoryKey), memoryKey(note)]);
  const next: Record<string, MemoryCategory> = {};
  for (const [key, value] of Object.entries(prefs.memoryCategories)) if (keep.has(key)) next[key] = value;
  next[memoryKey(note)] = category;
  return { ...prefs, memoryCategories: next };
}

export function withoutMemoryCategories(prefs: CoachPrefs, notes: ReadonlyArray<Pick<MemoryRef, 'id' | 'createdAt'>>): CoachPrefs {
  const keep = new Set(notes.map(memoryKey));
  const next: Record<string, MemoryCategory> = {};
  for (const [key, value] of Object.entries(prefs.memoryCategories)) if (keep.has(key)) next[key] = value;
  return { ...prefs, memoryCategories: next };
}

export function withCheckInReply(prefs: CoachPrefs, reply: CheckInReply): CoachPrefs {
  const others = prefs.checkInReplies.filter((existing) => existing.id !== reply.id);
  return { ...prefs, checkInReplies: [...others, reply].slice(-MAX_REPLIES) };
}

export function checkInReplyFor(prefs: CoachPrefs, id: string): CheckInReply | null {
  return prefs.checkInReplies.find((reply) => reply.id === id) ?? null;
}
