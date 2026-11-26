import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import { speechLocale, type DictationAvailability } from '@/data/dictation';
import {
  abortDictation,
  checkDictation,
  dictationErrorKind,
  downloadLanguagePack,
  requestMicrophone,
  startDictation,
  stopDictation,
} from '@/lib/speech';
import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/controls';
import { spacing, useTheme } from '@/ui/theme';

type Phase = 'idle' | 'starting' | 'listening';
type Notice = 'denied' | 'blocked' | 'failed' | 'download-started' | 'download-failed';

const UNAVAILABLE_TEXT = {
  ios: 'journal.voice.unavailableIos',
  'android-version': 'journal.voice.unavailableAndroid',
  'no-recogniser': 'journal.voice.unavailableRecogniser',
} as const satisfies Record<string, TranslationKey>;

const NOTICE_TEXT = {
  denied: 'journal.voice.denied',
  blocked: 'journal.voice.blocked',
  failed: 'journal.voice.failed',
  'download-started': 'journal.voice.downloadStarted',
  'download-failed': 'journal.voice.downloadFailed',
} as const satisfies Record<Notice, TranslationKey>;

interface Props {
  onText: (text: string) => void;
}

export function NoteDictation({ onText }: Props) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const [availability, setAvailability] = useState<DictationAvailability>({ kind: 'checking' });
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [checks, setChecks] = useState(0);
  const phaseRef = useRef<Phase>('idle');

  const updatePhase = useCallback((next: Phase): void => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    let current = true;
    void checkDictation(language).then((result) => {
      if (current) setAvailability(result);
    });
    return () => {
      current = false;
    };
  }, [language, checks]);

  useEffect(
    () => () => {
      if (phaseRef.current !== 'idle') abortDictation();
    },
    [],
  );

  useSpeechRecognitionEvent('start', () => updatePhase('listening'));
  useSpeechRecognitionEvent('end', () => updatePhase('idle'));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.isFinal ? event.results[0]?.transcript : undefined;
    if (transcript !== undefined) onText(transcript);
  });
  useSpeechRecognitionEvent('error', (event) => {
    updatePhase('idle');
    const kind = dictationErrorKind(event.error);
    if (kind === 'permission') setNotice('denied');
    else if (kind === 'language') setChecks((count) => count + 1);
    else if (kind === 'failed') setNotice('failed');
  });

  const begin = async (): Promise<void> => {
    if (availability.kind !== 'ready' || phaseRef.current !== 'idle') return;
    setNotice(null);
    updatePhase('starting');
    const permission = await requestMicrophone();
    if (permission !== 'granted') {
      updatePhase('idle');
      setNotice(permission === 'blocked' ? 'blocked' : 'denied');
      return;
    }
    startDictation(availability.locale);
  };

  const download = async (locale: string): Promise<void> => {
    setNotice(null);
    const outcome = await downloadLanguagePack(locale);
    if (outcome === 'finished') setChecks((count) => count + 1);
    else setNotice(outcome === 'started' ? 'download-started' : 'download-failed');
  };

  const recheck = (): void => {
    setNotice(null);
    setChecks((count) => count + 1);
  };

  if (availability.kind === 'checking') return null;

  const status = (key: TranslationKey, testID: string, tone: 'muted' | 'negative' = 'muted') => (
    <AppText variant="caption" muted={tone === 'muted'} color={tone === 'negative' ? colors.negative : undefined} accessibilityLiveRegion="polite" testID={testID}>
      {t(key, { language: speechLocale(language) })}
    </AppText>
  );

  if (availability.kind === 'unavailable') {
    return <View testID="note-dictate">{status(UNAVAILABLE_TEXT[availability.reason], 'note-dictate-unavailable')}</View>;
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
          <Button label={t('journal.voice.stop')} variant="secondary" icon="stop" onPress={stopDictation} testID="note-dictate-stop" />
        </>
      ) : (
        <>
          <Button label={t('journal.voice.start')} variant="secondary" icon="mic" onPress={() => void begin()} testID="note-dictate-start" />
          {status('journal.voice.onDevice', 'note-dictate-on-device')}
        </>
      )}
      {notice !== null ? status(NOTICE_TEXT[notice], 'note-dictate-notice', notice === 'failed' || notice === 'download-failed' ? 'negative' : 'muted') : null}
      {notice === 'blocked' ? (
        <Button label={t('journal.voice.openSettings')} variant="tertiary" onPress={() => void Linking.openSettings()} testID="note-dictate-settings" />
      ) : null}
      {notice === 'download-started' ? <Button label={t('journal.voice.recheck')} variant="tertiary" onPress={recheck} testID="note-dictate-recheck" /> : null}
    </View>
  );
}
