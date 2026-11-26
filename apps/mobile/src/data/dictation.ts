import type { Language } from './types';

export const DICTATION_MIN_ANDROID_API = 33;

const TARGET_LOCALE: Readonly<Record<Language, string>> = { nl: 'nl-NL', en: 'en-US' };

export type DictationUnavailable = 'ios' | 'android-version' | 'no-recogniser';

export type DictationAvailability =
  | { kind: 'checking' }
  | { kind: 'unavailable'; reason: DictationUnavailable }
  | { kind: 'language-missing' }
  | { kind: 'downloadable'; locale: string }
  | { kind: 'ready'; locale: string };

export type LocaleResolution =
  | { kind: 'installed'; locale: string }
  | { kind: 'downloadable'; locale: string }
  | { kind: 'missing' };

export function speechLocale(language: Language): string {
  return TARGET_LOCALE[language];
}

function normalise(tag: string): string {
  return tag.replace(/_/g, '-').toLowerCase();
}

function languageOf(tag: string): string {
  return normalise(tag).split('-')[0] ?? '';
}

function findLocale(candidates: readonly string[], target: string): string | undefined {
  const exact = candidates.find((tag) => normalise(tag) === normalise(target));
  return exact ?? candidates.find((tag) => languageOf(tag) === languageOf(target));
}

export function resolveSpeechLocale(language: Language, supported: readonly string[], installed: readonly string[]): LocaleResolution {
  const target = speechLocale(language);
  const present = findLocale(installed, target);
  if (present !== undefined) return { kind: 'installed', locale: present };
  const downloadable = findLocale(supported, target);
  if (downloadable !== undefined) return { kind: 'downloadable', locale: downloadable };
  return { kind: 'missing' };
}

export function appendDictation(current: string, transcript: string): string {
  const addition = transcript.trim();
  if (addition === '') return current;
  if (current.trim() === '') return addition;
  return /\s$/.test(current) ? `${current}${addition}` : `${current} ${addition}`;
}
