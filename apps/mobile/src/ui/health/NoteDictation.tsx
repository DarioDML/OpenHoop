import { Linking, View } from 'react-native';

import { speechLocale } from '@/data/dictation';
import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/controls';
import { spacing, useTheme } from '@/ui/theme';

import { DICTATION_NOTICE_TEXT, DICTATION_UNAVAILABLE_TEXT, useDictation } from './useDictation';

interface Props {
  onText: (text: string) => void;
  sessionKey: number;
}

export function NoteDictation({ onText, sessionKey }: Props) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { availability, phase, notice, begin, stop, download, recheck } = useDictation(language, onText, sessionKey);

  if (availability.kind === 'checking') return null;

  const status = (key: TranslationKey, testID: string, tone: 'muted' | 'negative' = 'muted') => (
    <AppText variant="caption" muted={tone === 'muted'} color={tone === 'negative' ? colors.negative : undefined} accessibilityLiveRegion="polite" testID={testID}>
      {t(key, { language: speechLocale(language) })}
    </AppText>
  );

  if (availability.kind === 'unavailable') {
    return <View testID="note-dictate">{status(DICTATION_UNAVAILABLE_TEXT[availability.reason], 'note-dictate-unavailable')}</View>;
  }

  if (availability.kind === 'language-missing') {
    return <View testID="note-dictate">{status('journal.voice.languageMissing', 'note-dictate-language-missing')}</View>;
  }

  const locale = availability.locale;
  const listening = phase !== 'idle';

  return (
    <View style={{ gap: spacing.sm }} testID="note-dictate">
      {availability.kind === 'downloadable' ? (
        <>
          {status('journal.voice.languagePack', 'note-dictate-language-pack')}
          <Button label={t('journal.voice.download')} variant="secondary" icon="import" onPress={() => void download(locale)} testID="note-dictate-download" />
        </>
      ) : listening ? (
        <>
          {status('journal.voice.listening', 'note-dictate-listening')}
          <Button label={t('journal.voice.stop')} variant="secondary" icon="stop" onPress={stop} testID="note-dictate-stop" />
        </>
      ) : (
        <>
          <Button label={t('journal.voice.start')} variant="secondary" icon="mic" onPress={() => void begin()} testID="note-dictate-start" />
          {status('journal.voice.onDevice', 'note-dictate-on-device')}
        </>
      )}
      {notice !== null ? status(DICTATION_NOTICE_TEXT[notice], 'note-dictate-notice', notice === 'failed' || notice === 'download-failed' ? 'negative' : 'muted') : null}
      {notice === 'blocked' ? (
        <Button label={t('journal.voice.openSettings')} variant="tertiary" onPress={() => void Linking.openSettings()} testID="note-dictate-settings" />
      ) : null}
      {notice === 'download-started' ? <Button label={t('journal.voice.recheck')} variant="tertiary" onPress={recheck} testID="note-dictate-recheck" /> : null}
    </View>
  );
}
