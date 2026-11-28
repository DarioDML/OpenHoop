import { Linking, Pressable, View } from 'react-native';

import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { GradientFill } from '@/ui/Screen';
import { radius, useTheme } from '@/ui/theme';

import type { Dictation, DictationNotice } from './useDictation';

const MIC_NOTICE_TEXT = {
  denied: 'journal.voice.micDenied',
  blocked: 'journal.voice.micBlocked',
  failed: 'journal.voice.micFailed',
  'download-started': 'journal.voice.downloadStarted',
  'download-failed': 'journal.voice.downloadFailed',
} as const satisfies Record<DictationNotice, TranslationKey>;

export function micNoticeKey(notice: DictationNotice): TranslationKey {
  return MIC_NOTICE_TEXT[notice];
}

export function VoiceMic({ dictation }: { dictation: Dictation }) {
  const { t } = useT();
  const { colors } = useTheme();
  const { availability, phase, notice } = dictation;
  const listening = phase !== 'idle';
  const usable = availability.kind === 'ready' || listening;
  const status: TranslationKey | null =
    availability.kind === 'checking'
      ? null
      : availability.kind === 'unavailable' || availability.kind === 'language-missing'
        ? 'journal.voice.micOff'
        : availability.kind === 'downloadable'
          ? 'journal.voice.micNeedsPack'
          : listening
            ? 'journal.voice.micListening'
            : 'journal.voice.micIdle';

  return (
    <View style={{ alignItems: 'center', gap: 14 }} testID="voice-mic-block">
      <View style={{ width: 140, height: 140, borderRadius: radius.pill, backgroundColor: colors.purpleSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable
          testID="voice-mic"
          accessibilityRole="button"
          accessibilityLabel={listening ? t('journal.voice.micStop') : t('journal.voice.micStart')}
          accessibilityState={{ disabled: !usable, busy: phase === 'starting' }}
          disabled={!usable}
          onPress={() => (listening ? dictation.stop() : void dictation.begin())}
          style={({ pressed }) => ({
            width: 112,
            height: 112,
            borderRadius: radius.pill,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !usable ? 0.45 : pressed ? 0.85 : 1,
          })}>
          <GradientFill id="voice-mic-fill" from={colors.coach.from} to={colors.coach.to} angle="diagonal" />
          <Icon name={listening ? 'stop' : 'mic'} color={colors.coach.on} size={listening ? 34 : 40} strokeWidth={2} />
        </Pressable>
      </View>
      {status !== null ? (
        <AppText variant="body" color={colors.levelC} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite" testID={listening ? 'voice-mic-listening' : 'voice-mic-status'}>
          {t(status)}
        </AppText>
      ) : null}
      {availability.kind === 'downloadable' ? (
        <Button label={t('journal.voice.download')} variant="secondary" compact icon="import" onPress={() => void dictation.download(availability.locale)} testID="voice-mic-download" />
      ) : null}
      {notice !== null ? (
        <AppText
          variant="caption"
          color={notice === 'failed' || notice === 'download-failed' ? colors.negative : colors.textSoft}
          style={{ textAlign: 'center' }}
          accessibilityLiveRegion="polite"
          testID="voice-mic-notice">
          {t(MIC_NOTICE_TEXT[notice])}
        </AppText>
      ) : null}
      {notice === 'blocked' ? <Button label={t('journal.voice.openSettings')} variant="tertiary" onPress={() => void Linking.openSettings()} testID="voice-mic-settings" /> : null}
      {notice === 'download-started' ? <Button label={t('journal.voice.recheck')} variant="tertiary" onPress={dictation.recheck} testID="voice-mic-recheck" /> : null}
    </View>
  );
}
