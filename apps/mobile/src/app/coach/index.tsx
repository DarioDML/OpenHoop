import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCoach } from '@/coach/CoachContext';
import { coachCheckIns, findCheckIn } from '@/coach/checkIns';
import { CONTEXT_DAYS } from '@/coach/context';
import { MAX_QUESTION_LENGTH, type CheckInDraft, type SendContext } from '@/coach/controller';
import { withCheckInReply, withDismissed } from '@/coach/prefs';
import { parseStoredChips, resolveChips } from '@/coach/reply';
import { useAppData } from '@/data/context';
import { appendDictation } from '@/data/dictation';
import { latestValue } from '@/data/healthDerived';
import type { MetricKey } from '@/data/derived';
import { TERMS, isTermId } from '@/data/terms';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber, todayIso } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { CheckInCard, ErrorCard, GateState, MetricChips, checkInQuestion, useCoachGate } from '@/ui/coach/parts';
import { useDictation } from '@/ui/health/useDictation';
import { micNoticeKey } from '@/ui/health/VoiceMic';
import { Icon } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { GradientFill } from '@/ui/Screen';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';

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

const PROMPTS: readonly TranslationKey[] = ['coach.prompt.compare', 'coach.prompt.sleep', 'coach.prompt.load', 'coach.prompt.today'];

const KEY_ERRORS = new Set(['invalid-key', 'no-key', 'forbidden', 'model-unavailable']);
const CHECK_IN_SHAPE = /^\d{4}-\d{2}-\d{2}:[a-zA-Z]{1,20}$/;

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  return value?.[0] ?? null;
}

export default function CoachScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const { days, userData, updateUserData } = useAppData();
  const { state, controller } = useCoach();
  const gate = useCoachGate();
  const ready = gate === 'ready';
  const params = useLocalSearchParams<{ ask?: string; conversation?: string; term?: string }>();
  const [draft, setDraft] = useState('');
  const [dictationSession, setDictationSession] = useState(0);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const handledAsk = useRef<string | null>(null);
  const handledConversation = useRef<string | null>(null);
  const handledTerm = useRef<string | null>(null);
  const checkInDraft = useRef<CheckInDraft | null>(null);
  const today = todayIso(new Date());
  const chips = CHIPS.map((spec) => ({ spec, latest: latestValue(days, spec.key) })).filter((c) => c.latest !== null);
  const checkIns = useMemo(() => coachCheckIns(days, userData.coach, today), [days, userData.coach, today]);
  const activeTitle = state.activeId === null ? null : (state.conversations.find((c) => c.id === state.activeId)?.title ?? null);

  const mic = useDictation(
    language,
    (words) => setDraft((current) => appendDictation(current, words).slice(0, MAX_QUESTION_LENGTH + 100)),
    dictationSession,
  );
  const listening = mic.phase !== 'idle';
  const micUsable = ready && (mic.availability.kind === 'ready' || listening);

  const ask = firstParam(params.ask);
  const conversation = firstParam(params.conversation);
  const term = firstParam(params.term);
  const withValues = userData.coach.access.scores;

  const context = useCallback(
    (): SendContext => ({ days, today, language, prefs: userData.coach, network: userData.network, journal: userData.journal }),
    [days, today, language, userData.coach, userData.network, userData.journal],
  );

  useEffect(() => {
    if (term === null || handledTerm.current === term || !isTermId(term)) return;
    handledTerm.current = term;
    setDraft(t('explain.coachQuestion', { name: t(TERMS[term].name) }));
  }, [term, t]);

  useEffect(() => {
    const queued = controller.takeDraft();
    if (queued === null) return;
    checkInDraft.current = queued;
    void controller.open(queued.conversationId).then(() => setDraft(queued.text));
  }, [controller]);

  useEffect(() => {
    if (ask === null || handledAsk.current === ask) return;
    handledAsk.current = ask;
    const checkIn = findCheckIn(days, ask, today);
    if (checkIn === null) {
      if (CHECK_IN_SHAPE.test(ask)) return;
      void controller.open(null);
      setDraft(ask.trim().slice(0, MAX_QUESTION_LENGTH));
      return;
    }
    void controller.open(null);
    setDraft(checkInQuestion(t, language, checkIn, withValues));
  }, [ask, days, today, controller, t, language, withValues]);

  useEffect(() => {
    if (conversation === null || handledConversation.current === conversation) return;
    handledConversation.current = conversation;
    const id = Number(conversation);
    if (Number.isInteger(id) && id > 0) void controller.open(id);
  }, [conversation, controller]);

  const tooLong = draft.trim().length > MAX_QUESTION_LENGTH;
  const canSend = ready && !state.sending && draft.trim() !== '' && !tooLong;

  const send = async (text: string): Promise<void> => {
    if (!ready || state.sending || text.trim() === '' || text.trim().length > MAX_QUESTION_LENGTH) return;
    setDraft('');
    setDictationSession((session) => session + 1);
    const sent = await controller.send(text, context());
    if (!sent) {
      setDraft(text);
      return;
    }
    const answered = checkInDraft.current;
    const conversationId = controller.getState().activeId;
    if (answered !== null && conversationId !== null) {
      checkInDraft.current = null;
      await updateUserData({ coach: withCheckInReply(userData.coach, { id: answered.checkInId, reply: answered.reply, conversationId }) });
    }
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

  const micStatus = listening ? t('coach.micListening') : mic.notice !== null ? t(micNoticeKey(mic.notice)) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="coach">
      <GradientFill id="coach-bg" from={colors.tint.coach} to={colors.background} stop={0.6} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          testID="screen-scroll"
          onContentSizeChange={() => {
            if (state.messages.length > 0 || state.sending) scrollRef.current?.scrollToEnd({ animated: true });
          }}
          contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: gutter, paddingBottom: spacing.xl, gap: spacing.lg }}>
          <TopBar
            title={t('coach.title')}
            right={<IconButton icon="settings" label={t('coach.settings.title')} onPress={() => router.push('/coach/settings')} testID="coach-settings-link" />}
          />

          {state.conversations.length > 0 || activeTitle !== null ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
              <Pressable
                testID="coach-continuing"
                accessibilityRole="link"
                onPress={() => router.push('/coach/history')}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surfaceAlt,
                  flexShrink: 1,
                  opacity: pressed ? 0.8 : 1,
                })}>
                <Icon name={activeTitle !== null ? 'sync' : 'clock'} color={colors.purple} size={18} />
                <AppText variant="label" soft style={{ flexShrink: 1 }}>
                  {activeTitle !== null ? t('coach.continuing', { title: activeTitle }) : t('coach.historyPill', { count: state.conversations.length })}
                </AppText>
              </Pressable>
              {state.activeId !== null ? (
                <Pressable
                  testID="coach-new"
                  accessibilityRole="button"
                  onPress={() => void controller.open(null)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                    opacity: pressed ? 0.8 : 1,
                  })}>
                  <Icon name="plus" color={colors.textSoft} size={16} />
                  <AppText variant="label" soft>
                    {t('coach.newConversation')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

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
                setDraft(checkInQuestion(t, language, checkIn, withValues));
              }}
              onDismiss={() => dismiss(checkIn.id)}
            />
          ))}

          <GateState gate={gate} />

          {ready && state.messages.length > 0 ? (
            <View style={{ gap: spacing.lg }} testID="coach-messages">
              {state.messages.map((message) =>
                message.role === 'user' ? (
                  <View
                    key={message.id}
                    style={{
                      alignSelf: 'flex-end',
                      maxWidth: '80%',
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderTopLeftRadius: 18,
                      borderTopRightRadius: 18,
                      borderBottomLeftRadius: 18,
                      borderBottomRightRadius: 4,
                      backgroundColor: colors.surface3,
                    }}>
                    <AppText variant="body" accessibilityLabel={`${t('coach.you')}: ${message.text}`}>
                      {message.text}
                    </AppText>
                  </View>
                ) : (
                  <View key={message.id} style={{ maxWidth: '92%', gap: spacing.sm }} testID={`coach-reply-${message.id}`}>
                    <AppText variant="body" soft>
                      {message.text}
                    </AppText>
                    <MetricChips chips={resolveChips(parseStoredChips(message.chips), days)} days={days} testID={`coach-reply-chips-${message.id}`} />
                  </View>
                ),
              )}
              <AppText variant="caption" muted>
                {t('coach.disclaimer')}
              </AppText>
            </View>
          ) : null}

          {state.sending ? (
            <View
              testID="coach-thinking"
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 10,
                paddingVertical: 10,
                paddingLeft: 14,
                paddingRight: 10,
                borderRadius: radius.pill,
                backgroundColor: colors.coach.surface,
              }}>
              <ActivityIndicator size="small" color={colors.purple} />
              <AppText variant="label" color={colors.levelC} style={{ flexShrink: 1 }}>
                {withValues ? t('coach.thinkingDays', { days: CONTEXT_DAYS }) : t('coach.thinking')}
              </AppText>
              <Pressable
                testID="coach-stop"
                accessibilityRole="button"
                accessibilityLabel={t('coach.stop')}
                onPress={controller.stop}
                hitSlop={8}
                style={{ width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface3 }}>
                <Icon name="stop" color={colors.text} size={12} strokeWidth={2.5} />
              </Pressable>
            </View>
          ) : null}

          {state.error !== null ? <ErrorCard message={t(`coach.error.${state.error}`)} actionLabel={errorAction?.label} onAction={errorAction?.onPress} /> : null}

          {state.messages.length === 0 ? (
            <>
              {ready ? (
                <AppText variant="body" muted testID="coach-empty">
                  {t('coach.emptyChat')}
                </AppText>
              ) : null}
              <ListGroup>
                <ListRow title={t('coach.history.title')} icon={{ icon: 'clock', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/history" testID="coach-link-history" />
                <ListRow title={t('coach.memory.title')} icon={{ icon: 'layers', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/memory" testID="coach-link-memory" />
                <ListRow title={t('coach.checkIn.title')} icon={{ icon: 'bell', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/check-in" testID="coach-link-check-in" />
                <ListRow title={t('coach.settings.title')} icon={{ icon: 'settings', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/settings" testID="coach-link-settings" />
              </ListGroup>
            </>
          ) : null}
        </ScrollView>

        <View
          testID="coach-composer"
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.sheet,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            gap: 10,
            opacity: ready ? 1 : 0.6,
          }}>
          {tooLong ? (
            <AppText variant="caption" color={colors.negative} testID="coach-too-long">
              {t('coach.tooLong', { max: MAX_QUESTION_LENGTH })}
            </AppText>
          ) : null}
          {micStatus !== null ? (
            <AppText variant="caption" color={listening ? colors.levelC : colors.textSoft} accessibilityLiveRegion="polite" testID="coach-mic-status">
              {micStatus}
            </AppText>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm }}>
            {PROMPTS.map((key) => (
              <Pressable
                key={key}
                testID={`coach-prompt-${key.split('.').pop() ?? key}`}
                accessibilityRole="button"
                disabled={!ready || state.sending}
                onPress={() => void send(t(key))}
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  opacity: pressed ? 0.8 : 1,
                })}>
                <AppText variant="label" soft>
                  {t(key)}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
            <TextInput
              testID="coach-input"
              accessibilityLabel={t('coach.composer')}
              value={draft}
              onChangeText={setDraft}
              editable={ready && !state.sending}
              multiline
              placeholder={t('coach.placeholder')}
              placeholderTextColor={colors.textFaint}
              style={{
                flex: 1,
                minHeight: 52,
                maxHeight: 132,
                borderRadius: 26,
                borderWidth: 1,
                borderColor: tooLong ? colors.negative : colors.borderStrong,
                backgroundColor: colors.surfaceAlt,
                color: colors.text,
                paddingHorizontal: 18,
                paddingTop: 15,
                paddingBottom: 15,
                fontSize: 16,
                fontFamily: fonts.regular,
              }}
            />
            {draft.trim() !== '' ? (
              <Pressable
                testID="coach-send"
                accessibilityRole="button"
                accessibilityLabel={t('coach.send')}
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={() => void send(draft)}
                style={({ pressed }) => ({
                  width: 52,
                  height: 52,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primary,
                  opacity: !canSend ? 0.4 : pressed ? 0.8 : 1,
                })}>
                <Icon name="send" color={colors.primaryOn} size={22} />
              </Pressable>
            ) : (
              <Pressable
                testID="coach-mic"
                accessibilityRole="button"
                accessibilityLabel={listening ? t('journal.voice.micStop') : t('coach.mic')}
                accessibilityState={{ disabled: !micUsable }}
                disabled={!micUsable}
                onPress={() => (listening ? mic.stop() : void mic.begin())}
                style={({ pressed }) => ({
                  width: 52,
                  height: 52,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: listening ? colors.purpleSoft : colors.surfaceAlt,
                  opacity: !micUsable ? 0.4 : pressed ? 0.8 : 1,
                })}>
                <Icon name={listening ? 'stop' : 'mic'} color={listening ? colors.purple : colors.text} size={22} />
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
