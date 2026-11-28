import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useCoach } from '@/coach/CoachContext';
import { promptFor } from '@/coach/controller';
import { cleanApiKey } from '@/coach/keyStore';
import { COACH_MODELS, COACH_PROACTIVITY, COACH_TONES, effectiveProactivity, withProactivity, type CoachAccess, type CoachModel, type CoachPrefs, type CoachProactivity } from '@/coach/prefs';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { todayIso } from '@/lib/format';
import { featureEnabled } from '@/net/features';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { ErrorCard } from '@/ui/coach/parts';
import { Button, Field, RadioRow, Segmented, Toggle } from '@/ui/controls';
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
type AccessKey = keyof CoachAccess | 'memory';

const ACCESS_ROWS: readonly AccessKey[] = ['scores', 'journal', 'sensors', 'memory'];

export default function CoachSettingsScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, userData, updateUserData } = useAppData();
  const { state, controller } = useCoach();
  const [keyDraft, setKeyDraft] = useState('');
  const [keyState, setKeyState] = useState<KeyState>('idle');
  const prefs = userData.coach;
  const networkOn = featureEnabled(userData.network, 'coach');
  const proactivity = effectiveProactivity(prefs);
  const sees = promptFor({ days, today: todayIso(new Date()), language, prefs, journal: userData.journal }, state.memory);

  const savePrefs = (next: CoachPrefs): void => {
    void updateUserData({ coach: next });
  };

  const accessValue = (key: AccessKey): boolean => (key === 'memory' ? prefs.memory : prefs.access[key]);
  const setAccess = (key: AccessKey, value: boolean): void => {
    savePrefs(key === 'memory' ? { ...prefs, memory: value } : { ...prefs, access: { ...prefs.access, [key]: value } });
  };

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
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void controller.deleteAll().then((deleted) => {
            if (deleted) savePrefs({ ...prefs, memoryCategories: {}, checkInReplies: [] });
          });
        },
      },
    ]);
  };

  return (
    <HealthPage title={t('coach.settings.title')} tint="coach" testID="coach-settings">
      {state.error === 'storage' ? <ErrorCard message={t('coach.error.storage')} /> : null}
      <ListGroup>
        <ListRow
          title={t('coach.settings.enabled')}
          subtitle={prefs.enabled ? t('coach.settings.enabledOn') : t('coach.settings.enabledOff')}
          chevron={false}
          right={<Toggle label={t('coach.settings.enabled')} value={prefs.enabled} onChange={(enabled) => savePrefs({ ...prefs, enabled })} testID="coach-enabled" />}
          testID="coach-settings-enabled"
        />
      </ListGroup>
      <ListGroup>
        <ListRow
          icon={tile(colors, networkOn ? 'link' : 'offline', networkOn ? 'positive' : 'neutral')}
          title={networkOn ? t('coach.settings.networkOn') : t('coach.settings.networkOff')}
          subtitle={t('coach.settings.networkBody')}
          href="/settings/privacy"
          testID="coach-settings-network"
        />
      </ListGroup>

      <CapHeader title={t('coach.settings.model')} />
      <View style={{ gap: spacing.sm }}>
        <RadioRow label={t('coach.settings.onDevice')} subtitle={t('coach.settings.onDeviceBody')} selected={false} disabled onSelect={() => undefined} testID="coach-source-device" />
        <RadioRow label={t('coach.settings.ownKey')} subtitle={t('coach.settings.ownKeyBody')} selected onSelect={() => undefined} testID="coach-source-key" />
      </View>
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
        <AppText variant="capSmall" muted>
          {t('coach.settings.claudeModel')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {COACH_MODELS.map((model) => (
            <Pill key={model} label={MODEL_LABELS[model]} selected={prefs.model === model} onPress={() => savePrefs({ ...prefs, model })} testID={`coach-model-${model}`} />
          ))}
        </View>
        <AppText variant="caption" muted>
          {t('coach.settings.modelHint')}
        </AppText>
      </Card>

      <CapHeader title={t('coach.settings.tone')} />
      <View style={{ gap: spacing.sm }}>
        {COACH_TONES.map((tone) => (
          <RadioRow
            key={tone}
            label={t(`coach.settings.tone.${tone}`)}
            subtitle={t(`coach.settings.tone.${tone}Body`)}
            selected={prefs.tone === tone}
            onSelect={() => savePrefs({ ...prefs, tone })}
            testID={`coach-tone-${tone}`}
          />
        ))}
      </View>

      <CapHeader title={t('coach.settings.proactivity')} />
      <Segmented<CoachProactivity>
        options={COACH_PROACTIVITY.map((value) => ({ value, label: t(`coach.settings.proactivity.${value}`), testID: `coach-proactivity-${value}` }))}
        value={proactivity}
        onChange={(value) => savePrefs(withProactivity(prefs, value))}
        testID="coach-proactivity"
      />
      <AppText variant="label" muted testID="coach-proactivity-body">
        {t(`coach.settings.proactivity.${proactivity}Body`)}
      </AppText>

      <CapHeader title={t('coach.settings.access')} />
      <ListGroup>
        {ACCESS_ROWS.map((key) => (
          <ListRow
            key={key}
            title={t(`coach.settings.access.${key}`)}
            subtitle={t(`coach.settings.access.${key}Body`)}
            chevron={false}
            right={<Toggle label={t(`coach.settings.access.${key}`)} value={accessValue(key)} onChange={(value) => setAccess(key, value)} testID={`coach-access-${key}`} />}
            testID={`coach-access-row-${key}`}
          />
        ))}
      </ListGroup>

      <ListGroup>
        <ListRow
          title={t('coach.memory.title')}
          subtitle={t('coach.settings.memoryCount', { count: state.memory.length })}
          href="/coach/memory"
          testID="coach-settings-memory"
        />
        <ListRow
          title={t('coach.checkIn.title')}
          subtitle={t(`coach.settings.proactivity.${proactivity}`)}
          href="/coach/check-in"
          testID="coach-settings-check-in"
        />
      </ListGroup>

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
