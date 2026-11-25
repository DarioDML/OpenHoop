import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { useCoach } from '@/coach/CoachContext';
import { activeCheckIns } from '@/coach/checkIns';
import { MAX_QUESTION_LENGTH } from '@/coach/controller';
import { parseStoredChips, resolveChips } from '@/coach/reply';
import { withDismissed } from '@/coach/prefs';
import { useAppData } from '@/data/context';
import { latestValue } from '@/data/healthDerived';
import type { MetricKey } from '@/data/derived';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber, todayIso } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { CheckInCard, ErrorCard, GateState, MetricChips, checkInQuestion, useCoachGate } from '@/ui/coach/parts';
import { Button, Field } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { radius, spacing, useTheme } from '@/ui/theme';

interface ChipSpec {
  key: MetricKey;
  labelKey: TranslationKey;
  unitKey: TranslationKey | null;
  decimals: number;
}

const CHIPS: readonly ChipSpec[] = [
  { key: 'readiness', labelKey: 'score.readiness', unitKey: null, decimals: 0 },
  { key: 'hrv', labelKey: 'metric.hrv', unitKey: 'unit.ms', decimals: 0 },
  { key: 'restingHr', labelKey: 'metric.restingHr', unitKey: 'unit.bpm', decimals: 0 },
];

const KEY_ERRORS = new Set(['invalid-key', 'no-key', 'forbidden', 'model-unavailable']);

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  return value?.[0] ?? null;
}

export default function CoachScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, userData, updateUserData } = useAppData();
  const { state, controller } = useCoach();
  const gate = useCoachGate();
  const params = useLocalSearchParams<{ ask?: string; conversation?: string }>();
  const [draft, setDraft] = useState('');
  const handledAsk = useRef<string | null>(null);
  const handledConversation = useRef<string | null>(null);
  const chips = CHIPS.map((spec) => ({ spec, latest: latestValue(days, spec.key) })).filter((c) => c.latest !== null);
  const checkIns = useMemo(
    () => (userData.coach.checkIns ? activeCheckIns(days, userData.coach.dismissedCheckIns) : []),
    [days, userData.coach.checkIns, userData.coach.dismissedCheckIns],
  );

  const ask = firstParam(params.ask);
  const conversation = firstParam(params.conversation);

  useEffect(() => {
    if (ask === null || handledAsk.current === ask) return;
    handledAsk.current = ask;
    const checkIn = activeCheckIns(days, []).find((c) => c.id === ask);
    if (checkIn) {
      void controller.open(null);
      setDraft(checkInQuestion(t, language, checkIn));
    }
  }, [ask, days, controller, t, language]);

  useEffect(() => {
    if (conversation === null || handledConversation.current === conversation) return;
    handledConversation.current = conversation;
    const id = Number(conversation);
    if (Number.isInteger(id) && id > 0) void controller.open(id);
  }, [conversation, controller]);

  const tooLong = draft.trim().length > MAX_QUESTION_LENGTH;
  const canSend = gate === 'ready' && !state.sending && draft.trim() !== '' && !tooLong;

  const send = async (): Promise<void> => {
    const question = draft;
    setDraft('');
    const sent = await controller.send(question, {
      days,
      today: todayIso(new Date()),
      language,
      prefs: userData.coach,
      network: userData.network,
    });
    if (!sent) setDraft(question);
  };

  const dismiss = (id: string): void => {
    void updateUserData({ coach: withDismissed(userData.coach, id) });
  };

  const errorAction =
    state.error === null
      ? undefined
      : KEY_ERRORS.has(state.error)
        ? { label: t('coach.errorKeyAction'), onPress: () => router.push('/coach/settings') }
        : state.error === 'network-off'
          ? { label: t('coach.offAction'), onPress: () => router.push('/settings/privacy') }
          : undefined;

  return (
    <HealthPage
      title={t('coach.title')}
      tint="coach"
      testID="coach"
      hero={
        <AppText variant="lead" muted>
          {t('coach.subtitle')}
        </AppText>
      }>
      {chips.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID="coach-chips">
          {chips.map(({ spec, latest }) => (
            <View key={spec.key} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface }}>
              <AppText variant="label" soft numeric>
                {`${t(spec.labelKey)} ${latest ? formatNumber(latest.value, spec.decimals, language) : ''}${spec.unitKey ? ` ${t(spec.unitKey)}` : ''}`}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {checkIns.map((checkIn) => (
        <CheckInCard
          key={checkIn.id}
          checkIn={checkIn}
          onAsk={() => {
            void controller.open(null);
            setDraft(checkInQuestion(t, language, checkIn));
          }}
          onDismiss={() => dismiss(checkIn.id)}
        />
      ))}

      <GateState gate={gate} />

      {gate === 'ready' ? (
        <>
          {state.activeId !== null ? (
            <CapHeader title={state.conversations.find((c) => c.id === state.activeId)?.title ?? ''} action={t('coach.newConversation')} onAction={() => void controller.open(null)} />
          ) : null}
          {state.messages.length === 0 ? (
            <AppText variant="body" muted testID="coach-empty">
              {t('coach.emptyChat')}
            </AppText>
          ) : (
            <View style={{ gap: spacing.md }} testID="coach-messages">
              {state.messages.map((message) =>
                message.role === 'user' ? (
                  <View
                    key={message.id}
                    style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.coach.surface }}>
                    <AppText variant="body" accessibilityLabel={`${t('coach.you')}: ${message.text}`}>
                      {message.text}
                    </AppText>
                  </View>
                ) : (
                  <Card key={message.id} style={{ gap: spacing.md }} testID={`coach-reply-${message.id}`}>
                    <MetricChips chips={resolveChips(parseStoredChips(message.chips), days)} testID={`coach-reply-chips-${message.id}`} />
                    <AppText variant="body">{message.text}</AppText>
                  </Card>
                ),
              )}
              <AppText variant="caption" muted>
                {t('coach.disclaimer')}
              </AppText>
            </View>
          )}
          {state.sending ? (
            <AppText variant="label" muted testID="coach-thinking">
              {t('coach.thinking')}
            </AppText>
          ) : null}
        </>
      ) : null}

      {state.error !== null ? <ErrorCard message={t(`coach.error.${state.error}`)} actionLabel={errorAction?.label} onAction={errorAction?.onPress} /> : null}

      <Card style={{ gap: spacing.md, opacity: gate === 'ready' ? 1 : 0.5 }} testID="coach-composer">
        <Field
          label={t('coach.composer')}
          value={draft}
          onChangeText={setDraft}
          editable={gate === 'ready' && !state.sending}
          multiline
          error={tooLong}
          hint={tooLong ? t('coach.tooLong', { max: MAX_QUESTION_LENGTH }) : undefined}
          testID="coach-input"
        />
        <Button label={t('coach.send')} icon="send" onPress={() => void send()} disabled={!canSend} testID="coach-send" />
      </Card>

      <ListGroup>
        <ListRow title={t('coach.history.title')} icon={{ icon: 'clock', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/history" testID="coach-link-history" />
        <ListRow title={t('coach.memory.title')} icon={{ icon: 'layers', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/memory" testID="coach-link-memory" />
        <ListRow title={t('coach.checkIn.title')} icon={{ icon: 'bell', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/check-in" testID="coach-link-check-in" />
        <ListRow title={t('coach.settings.title')} icon={{ icon: 'settings', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/settings" testID="coach-link-settings" />
      </ListGroup>
    </HealthPage>
  );
}
