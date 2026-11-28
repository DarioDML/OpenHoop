import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { chipStatus } from '@/coach/chipStatus';
import { checkInStreak, coachCheckIns, scanForCheckIns, type CheckIn } from '@/coach/checkIns';
import { COACH_METRIC_SPECS } from '@/coach/metrics';
import {
  CHECK_IN_REPLIES,
  checkInReplyFor,
  effectiveProactivity,
  withCheckInReply,
  withCheckInsShown,
  withDismissed,
  type CheckInReplyKind,
  type CoachPrefs,
} from '@/coach/prefs';
import { useAppData } from '@/data/context';
import { metricValue } from '@/data/derived';
import type { TranslationKey } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import type { Language } from '@/data/types';
import { todayIso } from '@/lib/format';
import { formatTemperatureDelta, useUnits } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { CheckInCard, formatMetric } from '@/ui/coach/parts';
import { Toggle } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { Icon } from '@/ui/Icon';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { radius, spacing, useTheme, type ColorTokens } from '@/ui/theme';

const SKIN_NOTABLE_C = 0.3;

interface DataChip {
  key: string;
  label: string;
  tone: 'better' | 'worse' | 'usual' | 'unknown';
}

function chipColors(colors: ColorTokens, tone: DataChip['tone']): { fg: string; bg: string } {
  if (tone === 'better') return { fg: colors.positive, bg: colors.positiveSoft };
  if (tone === 'worse') return { fg: colors.negative, bg: colors.negativeSoft };
  return { fg: colors.warning, bg: colors.warningSoft };
}

function bannerText(t: TFunction, checkIn: CheckIn, streak: number): string {
  const metric = t(COACH_METRIC_SPECS[checkIn.metric].labelKey);
  if (checkIn.kind === 'week') return t('coach.checkIn.bannerWeek');
  if (streak >= 2) return t(checkIn.direction === 'down' ? 'coach.checkIn.bannerStreakDown' : 'coach.checkIn.bannerStreakUp', { metric, count: streak });
  return t(checkIn.direction === 'down' ? 'coach.checkIn.bannerDown' : 'coach.checkIn.bannerUp', { metric });
}

function messageText(t: TFunction, language: Language, checkIn: CheckIn, streak: number, skin: string | null): string {
  const params = {
    metric: t(COACH_METRIC_SPECS[checkIn.metric].labelKey),
    value: formatMetric(t, language, checkIn.metric, checkIn.value),
    usual: formatMetric(t, language, checkIn.metric, checkIn.usual),
  };
  if (checkIn.kind === 'week') return t('coach.checkIn.weekMessage', params);
  const parts = [t('coach.checkIn.message', params)];
  if (streak >= 2) parts.push(t('coach.checkIn.messageStreak', { count: streak }));
  if (skin !== null) parts.push(t('coach.checkIn.messageSkin', { value: skin }));
  parts.push(t('coach.checkIn.messageAsk'));
  return parts.join(' ');
}

const REPLY_LABELS: Readonly<Record<CheckInReplyKind, TranslationKey>> = {
  sick: 'coach.checkIn.reply.sick',
  tired: 'coach.checkIn.reply.tired',
  travelling: 'coach.checkIn.reply.travelling',
  later: 'coach.checkIn.reply.later',
};

export default function CoachCheckInScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const units = useUnits();
  const { days, userData, updateUserData } = useAppData();
  const prefs = userData.coach;
  const today = todayIso(new Date());
  const mode = effectiveProactivity(prefs);
  const shown = mode !== 'off';
  const scan = scanForCheckIns(days, prefs.dismissedCheckIns);
  const current = coachCheckIns(days, prefs, today);
  const top = current[0] ?? null;
  const streak = top === null ? 0 : checkInStreak(days, top);
  const latest = days[days.length - 1];
  const skinDelta = latest === undefined ? null : metricValue(latest, 'skinTempDeviation');
  const skinNotable = skinDelta !== null && Math.abs(skinDelta) >= SKIN_NOTABLE_C;
  const skinText = skinDelta === null ? null : (() => {
    const measure = formatTemperatureDelta(skinDelta, units, language);
    return `${measure.value} ${measure.unit}`;
  })();
  const answered = top === null ? null : checkInReplyFor(prefs, top.id);

  let status: TranslationKey | null = null;
  if (!prefs.enabled) status = 'coach.checkIn.coachOff';
  else if (!shown) status = 'coach.checkIn.off';
  else if (scan.status === 'no-data') status = 'coach.checkIn.noData';
  else if (scan.status === 'needs-history' && current.length === 0) status = 'coach.checkIn.needsHistory';
  else if (current.length === 0) status = 'coach.checkIn.none';

  const chips: DataChip[] =
    top === null
      ? []
      : [
          ...current
            .filter((checkIn) => checkIn.kind !== 'week')
            .map((checkIn) => ({
              key: checkIn.id,
              label: `${t(COACH_METRIC_SPECS[checkIn.metric].labelKey)} ${formatMetric(t, language, checkIn.metric, checkIn.value)}`,
              tone: chipStatus(days, checkIn.metric, checkIn.day, checkIn.value).tone,
            })),
          ...(top.kind === 'week'
            ? [{ key: 'week', label: `${t(COACH_METRIC_SPECS[top.metric].labelKey)} ${formatMetric(t, language, top.metric, top.value)}`, tone: top.direction === 'up' ? ('better' as const) : ('worse' as const) }]
            : []),
          ...(skinNotable && skinText !== null ? [{ key: 'skin', label: `${t('readinessShort.temp')} ${skinText}`, tone: 'usual' as const }] : []),
        ];

  const save = (next: CoachPrefs): void => {
    void updateUserData({ coach: next });
  };

  const answer = (reply: CheckInReplyKind): void => {
    if (top === null) return;
    const record = { id: top.id, reply, conversationId: answered?.conversationId ?? null };
    if (reply === 'later') {
      save(withCheckInReply(current.reduce((next, checkIn) => withDismissed(next, checkIn.id), prefs), record));
      return;
    }
    save(withCheckInReply(prefs, record));
    router.push({ pathname: '/coach', params: { ask: top.id, reply } });
  };

  return (
    <HealthPage
      title={t('coach.title')}
      tint="coach"
      testID="coach-check-in"
      hero={
        top !== null ? (
          <View
            testID="check-in-banner"
            accessible
            style={{ flexDirection: 'row', gap: spacing.md, padding: 14, borderRadius: 20, backgroundColor: colors.surfaceAlt }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.coach.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="sparkle" color={colors.text} size={20} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <AppText variant="bodyStrong">{t('coach.title')}</AppText>
                <AppText variant="caption" muted>
                  {top.day === today ? t('common.today') : top.kind === 'week' ? t('coach.checkIn.thisWeek') : t('coach.checkIn.latestDay')}
                </AppText>
              </View>
              <AppText variant="body" soft>
                {bannerText(t, top, streak)}
              </AppText>
            </View>
          </View>
        ) : (
          <AppText variant="lead" muted>
            {t('coach.checkIn.body')}
          </AppText>
        )
      }>
      {top !== null ? (
        <>
          <View style={{ gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.coach.surface }} testID="check-in-message">
            <AppText variant="body" soft>
              {messageText(t, language, top, streak, skinNotable ? skinText : null)}
            </AppText>
            {chips.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} testID="check-in-chips">
                {chips.map((chip) => {
                  const tone = chipColors(colors, chip.tone);
                  return (
                    <View key={chip.key} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: tone.bg }}>
                      <AppText variant="label" color={tone.fg} numeric style={{ fontWeight: '600' }}>
                        {chip.label}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID="check-in-replies">
            {CHECK_IN_REPLIES.map((reply) => {
              const selected = answered?.reply === reply;
              return (
                <Pressable
                  key={reply}
                  testID={`check-in-reply-${reply}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => answer(reply)}
                  style={({ pressed }) => ({
                    minHeight: 40,
                    paddingHorizontal: spacing.lg,
                    justifyContent: 'center',
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: selected ? colors.purple : colors.borderStrong,
                    backgroundColor: selected ? colors.border : 'transparent',
                    opacity: pressed ? 0.8 : 1,
                  })}>
                  <AppText variant="body" color={selected ? colors.text : colors.textMuted} style={{ fontWeight: '500' }}>
                    {t(REPLY_LABELS[reply])}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {answered !== null ? (
            <AppText variant="label" muted testID="check-in-answered">
              {t('coach.checkIn.answered', { reply: t(REPLY_LABELS[answered.reply]) })}
            </AppText>
          ) : null}
          <Pressable
            testID="check-in-footnote"
            accessibilityRole="link"
            onPress={() => router.push('/coach/settings')}
            style={({ pressed }) => ({ flexDirection: 'row', gap: spacing.md, padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.85 : 1 })}>
            <Icon name="bell" color={colors.textSoft} size={18} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="bodyStrong" soft>
                {t('coach.checkIn.footTitle')}
              </AppText>
              <AppText variant="label" soft>
                {t(mode === 'weekly' ? 'coach.checkIn.footWeekly' : 'coach.checkIn.footPatterns')}
              </AppText>
            </View>
          </Pressable>
        </>
      ) : null}

      <ListGroup>
        <ListRow
          title={t('coach.checkIn.toggle')}
          subtitle={t('coach.checkIn.toggleBody')}
          chevron={false}
          right={<Toggle label={t('coach.checkIn.toggle')} value={shown} onChange={(value) => save(withCheckInsShown(prefs, value))} testID="coach-check-in-toggle" />}
        />
      </ListGroup>
      {status !== null ? (
        <AppText variant="body" muted testID="coach-check-in-status">
          {t(status)}
        </AppText>
      ) : null}
      {current.length > 0 ? (
        <>
          <CapHeader title={t('coach.checkIn.allTitle')} />
          {current.map((checkIn) => (
            <CheckInCard
              key={checkIn.id}
              checkIn={checkIn}
              onAsk={() => router.push({ pathname: '/coach', params: { ask: checkIn.id } })}
              onDismiss={() => save(withDismissed(prefs, checkIn.id))}
            />
          ))}
        </>
      ) : null}
    </HealthPage>
  );
}
