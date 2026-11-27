import type { Language } from '@/data/types';

import coreEn from './en.json';
import coreNl from './nl.json';
import activityEn from './sections/activity.en.json';
import activityNl from './sections/activity.nl.json';
import coachEn from './sections/coach.en.json';
import coachNl from './sections/coach.nl.json';
import dailyEn from './sections/daily.en.json';
import dailyNl from './sections/daily.nl.json';
import explainEn from './sections/explain.en.json';
import explainNl from './sections/explain.nl.json';
import healthEn from './sections/health.en.json';
import healthNl from './sections/health.nl.json';
import strengthEn from './sections/strength.en.json';
import strengthNl from './sections/strength.nl.json';
import manageEn from './sections/manage.en.json';
import manageNl from './sections/manage.nl.json';
import planEn from './sections/plan.en.json';
import planNl from './sections/plan.nl.json';
import readinessEn from './sections/readiness.en.json';
import readinessNl from './sections/readiness.nl.json';
import routeEn from './sections/route.en.json';
import routeNl from './sections/route.nl.json';
import sleepEn from './sections/sleep.en.json';
import sleepNl from './sections/sleep.nl.json';
import stravaEn from './sections/strava.en.json';
import stravaNl from './sections/strava.nl.json';

const nl = { ...coreNl, ...manageNl, ...dailyNl, ...activityNl, ...healthNl, ...coachNl, ...strengthNl, ...routeNl, ...stravaNl, ...explainNl, ...readinessNl, ...planNl, ...sleepNl };
const en = { ...coreEn, ...manageEn, ...dailyEn, ...activityEn, ...healthEn, ...coachEn, ...strengthEn, ...routeEn, ...stravaEn, ...explainEn, ...readinessEn, ...planEn, ...sleepEn };

export type TranslationKey = keyof typeof nl;
export type TranslationParams = Record<string, string | number>;

const dictionaries: Record<Language, Record<TranslationKey, string>> = { nl, en };

export const allTranslations: Readonly<Record<Language, Readonly<Record<string, string>>>> = { nl, en };

export const KNOWN_REASONS = ['no-data', 'low-coverage', 'no-sleep', 'missing-signal', 'needs-history', 'no-profile'] as const;
export type KnownReason = (typeof KNOWN_REASONS)[number];

export function translate(language: Language, key: TranslationKey, params?: TranslationParams): string {
  const template = dictionaries[language][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function detectLanguage(languageCode: string | null | undefined): Language {
  return languageCode === 'nl' ? 'nl' : 'en';
}

export function isKnownReason(reason: string): reason is KnownReason {
  return (KNOWN_REASONS as readonly string[]).includes(reason);
}

export function reasonKey(reason: string | null): TranslationKey {
  if (reason === null) return 'reason.no-data';
  return isKnownReason(reason) ? `reason.${reason}` : 'reason.unknown';
}

export function reasonText(language: Language, reason: string | null): string {
  return translate(language, reasonKey(reason));
}
