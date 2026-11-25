import type { Language } from '@/data/types';

import en from './en.json';
import nl from './nl.json';

export type TranslationKey = keyof typeof nl;
export type TranslationParams = Record<string, string | number>;

const dictionaries: Record<Language, Record<TranslationKey, string>> = { nl, en };

export const KNOWN_REASONS = ['no-data', 'low-coverage', 'no-sleep', 'missing-signal', 'needs-history'] as const;
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
