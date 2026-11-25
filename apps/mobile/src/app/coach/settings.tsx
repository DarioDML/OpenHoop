import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useCoach } from '@/coach/CoachContext';
import { promptFor } from '@/coach/controller';
import { cleanApiKey } from '@/coach/keyStore';
import { COACH_MODELS, type CoachModel } from '@/coach/prefs';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { todayIso } from '@/lib/format';
import { featureEnabled } from '@/net/features';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { ErrorCard } from '@/ui/coach/parts';
import { Button, Field } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { tile } from '@/ui/manage/tiles';
import { fonts, spacing, useTheme } from '@/ui/theme';

const MODEL_LABELS: Record<CoachModel, string> = {
  'claude-sonnet-5-5': 'Sonnet 5.5',
  'claude-opus-5-5': 'Opus 5.5',
  'claude-haiku-5-5': 'Haiku 5.5',
};

type KeyState = 'idle' | 'invalid' | 'saved';

export default function CoachSettingsScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, userData, updateUserData } = useAppData();
  const { state, controller } = useCoach();
  const [keyDraft, setKeyDraft] = useState('');
  const [keyState, setKeyState] = useState<KeyState>('idle');
  const networkOn = featureEnabled(userData.network, 'coach');
  const sees = promptFor({ days, today: todayIso(new Date()), language, prefs: userData.coach }, state.memory);

  const saveKey = async (): Promise<void> => {
    if (cleanApiKey(keyDraft) === null) {
      setKeyState('invalid');
      return;
    }
    const saved = await controller.saveKey(keyDraft);
    setKeyDraft('');
    setKeyState(saved ? 'saved' : 'idle');
  };

  const confirmRemoveKey = (): void => {
    Alert.alert(t('coach.settings.removeKeyTitle'), t('coach.settings.removeKeyBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('coach.settings.removeKey'), style: 'destructive', onPress: () => void controller.removeKey() },
    ]);
  };

  const confirmDeleteAll = (): void => {
    Alert.alert(t('coach.settings.deleteAllTitle'), t('coach.settings.deleteAllBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void controller.deleteAll() },
    ]);
  };

  return (
    <HealthPage title={t('coach.settings.title')} tint="coach" testID="coach-settings">
      {state.error === 'storage' ? <ErrorCard message={t('coach.error.storage')} /> : null}
      <ListGroup>
        <ListRow
          icon={tile(colors, networkOn ? 'link' : 'offline', networkOn ? 'positive' : 'neutral')}
          title={networkOn ? t('coach.settings.networkOn') : t('coach.settings.networkOff')}
          subtitle={t('coach.settings.networkBody')}
          href="/settings/privacy"
          testID="coach-settings-network"
        />
      </ListGroup>

      <CapHeader title={t('coach.settings.keyTitle')} />
      <Card style={{ gap: spacing.md }}>
        <AppText variant="body" testID="coach-key-status">
          {state.hasKey ? t('coach.settings.keySaved') : t('coach.settings.keyNone')}
        </AppText>
        <Field
          label={state.hasKey ? t('coach.settings.keyReplace') : t('coach.settings.keyLabel')}
          value={keyDraft}
          onChangeText={(value) => {
            setKeyDraft(value);
            setKeyState('idle');
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          error={keyState === 'invalid'}
          hint={keyState === 'invalid' ? t('coach.settings.keyInvalid') : t('coach.settings.keyHint')}
          testID="coach-key-input"
        />
        <Button
          label={keyState === 'saved' ? t('common.saved') : t('coach.settings.saveKey')}
          variant="secondary"
          onPress={() => void saveKey()}
          disabled={keyDraft.trim() === ''}
          testID="coach-key-save"
        />
        {state.hasKey ? <Button label={t('coach.settings.removeKey')} variant="danger" onPress={confirmRemoveKey} testID="coach-key-remove" /> : null}
      </Card>

      <CapHeader title={t('coach.settings.model')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {COACH_MODELS.map((model) => (
          <Pill
            key={model}
            label={MODEL_LABELS[model]}
            selected={userData.coach.model === model}
            onPress={() => void updateUserData({ coach: { ...userData.coach, model } })}
            testID={`coach-model-${model}`}
          />
        ))}
      </View>
      <AppText variant="caption" muted>
        {t('coach.settings.modelHint')}
      </AppText>

      <CapHeader title={t('coach.settings.seesTitle')} />
      <Card style={{ gap: spacing.md }}>
        <AppText variant="label" muted>
          {t('coach.settings.seesBody')}
        </AppText>
        <AppText variant="caption" selectable style={{ fontFamily: fonts.mono }} testID="coach-sees">
          {sees}
        </AppText>
      </Card>

      <Button label={t('coach.settings.deleteAll')} variant="danger" onPress={confirmDeleteAll} testID="coach-delete-all" />
    </HealthPage>
  );
}
