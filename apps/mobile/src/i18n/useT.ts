import { useCallback } from 'react';

import { useAppData } from '@/data/context';
import type { Language } from '@/data/types';

import { reasonText, translate, type TranslationKey, type TranslationParams } from './index';

export type TFunction = (key: TranslationKey, params?: TranslationParams) => string;

export interface Translator {
  t: TFunction;
  language: Language;
  reason: (reason: string | null) => string;
}

export function useT(): Translator {
  const language = useAppData().settings.language;
  const t = useCallback<TFunction>((key, params) => translate(language, key, params), [language]);
  const reason = useCallback((value: string | null) => reasonText(language, value), [language]);
  return { t, language, reason };
}
