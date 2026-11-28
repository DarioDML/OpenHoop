import { reasonKey, type TranslationKey } from '@/i18n';

export function needReasonKey(reason: string | null): TranslationKey {
  return reason === 'no-sleep' ? 'sleepx.needUnknown' : reasonKey(reason);
}
