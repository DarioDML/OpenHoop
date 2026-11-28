import { router } from 'expo-router';
import { View } from 'react-native';

import { loadTargetBand, targetAdvice } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { rangeStatus } from '@/data/derived';
import { LOAD_SCALE_MAX, MAX_ESTIMATE_MIN, minutesToLoad, roundMinutes } from '@/data/loadDerived';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { NoDataScreen } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import type { ExplainTarget } from '@/ui/explain/ExplainProvider';
import { MetricName } from '@/ui/explain/MetricName';
import { LevelNote } from '@/ui/LevelNote';
import { BuzzSwitches } from '@/ui/load/BuzzSwitches';
import { LoadRing } from '@/ui/load/LoadRing';
import { TargetPill } from '@/ui/load/TargetPill';
import { useLoadToday } from '@/ui/load/useLoadToday';
import { Num } from '@/ui/Num';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

export default function LoadTargetScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const today = useLoadToday();
  if (today === null) return <NoDataScreen title={t('loadx.target.screen')} />;

  const band = today.targetsHidden ? null : loadTargetBand(days);
  const status = rangeStatus(today.day.load.value, band);
  const advice = targetAdvice(today.readiness);
  const fmt = (v: number): string => formatNumber(v, 1, language);
  const view = today.view;
  const percent = view?.progress === null || view === null ? null : Math.round(view.progress * 100);
  const caption = today.live ? t('loadTarget.ring.live') : today.soFar ? t('loadTarget.ring.soFar') : t('loadx.target.today');
  const explainTarget: ExplainTarget = { term: 'loadTarget', index: today.index, shown: view === null ? null : { value: `${fmt(view.aim.low)}–${fmt(view.aim.high)}`, unit: null, reason: null } };
  const minutes = view !== null && view.status === 'below' && today.value !== null ? minutesToLoad(today.value, view.aim.low, today.trainingHr, today.ref) : null;

  const progressText = today.targetsHidden
    ? t('loadTarget.hidden.body')
    : view === null
      ? t('loadScreen.advice.calibrating')
      : view.status === null
        ? t('loadScreen.advice.noLoad')
        : view.status === 'above'
          ? t('loadTarget.above', { high: fmt(view.aim.high) })
          : view.status === 'within'
            ? t('loadTarget.reached', { high: fmt(view.aim.high) })
            : minutes === null
              ? t('loadScreen.advice.noEstimate', { low: fmt(view.aim.low), high: fmt(view.aim.high) })
              : minutes > MAX_ESTIMATE_MIN
                ? t('loadTarget.estimateFar', { hours: MAX_ESTIMATE_MIN / 60 })
                : t('loadTarget.estimate', { minutes: roundMinutes(minutes) });

  return (
    <Screen
      tint="load"
      header={
        <>
          <TopBar title={t('loadx.target.screen')} />
          <View style={{ alignItems: 'center', gap: 14 }}>
            <LoadRing testID="target-ring" value={today.value} max={LOAD_SCALE_MAX} aim={today.aim} caption={caption} reason={today.reason} numberSize={100} />
            <TargetPill view={view} hidden={today.targetsHidden} testID="target-pill" />
          </View>
        </>
      }>
      <Card testID="target-progress" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
          <MetricName target={explainTarget} label={t('loadTarget.progress.title')} variant="cap" testID="target-progress-name" />
          {percent !== null ? (
            <Num size={22} testID="target-progress-percent">
              {`${percent}%`}
            </Num>
          ) : null}
        </View>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={percent === null || view === null ? progressText : t('loadTarget.progress.a11y', { percent, low: fmt(view.aim.low) })}
          style={{ height: 12, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: 'hidden' }}>
          {percent !== null && percent > 0 ? <View style={{ width: `${percent}%`, height: 12, borderRadius: radius.pill, backgroundColor: colors.accent }} /> : null}
        </View>
        <AppText variant="label" muted testID="target-estimate">
          {progressText}
        </AppText>
        {minutes !== null ? (
          <AppText variant="caption" muted testID="target-basis">
            {t('loadTarget.basis', { hr: Math.round(today.trainingHr) })}
          </AppText>
        ) : null}
      </Card>

      <BuzzSwitches today={today} />

      <Card>
        <AppText variant="cardTitle">{t('loadx.target.how.title')}</AppText>
        <AppText variant="body" muted>
          {t('loadx.target.how.body')}
        </AppText>
        {band ? (
          <>
            <AppText variant="body" soft testID="target-usual">
              {t('loadx.target.usual', { low: fmt(band.low), high: fmt(band.high) })}
            </AppText>
            {status ? <Chip tone={status === 'within' ? 'positive' : 'info'} label={t(`range.${status}`, { low: fmt(band.low), high: fmt(band.high) })} /> : null}
          </>
        ) : today.targetsHidden ? (
          <AppText variant="label" muted testID="target-hidden">
            {t('loadTarget.hidden.body')}
          </AppText>
        ) : (
          <Chip tone="warning" label={t('range.calibrating')} />
        )}
      </Card>

      <Card>
        <AppText variant="cardTitle">{t('loadx.target.advice.title')}</AppText>
        <AppText variant="body" muted testID="target-advice">
          {t(`loadx.target.advice.${advice}`)}
        </AppText>
        {view !== null ? (
          <AppText variant="bodyStrong" testID="target-today">
            {t('loadTarget.today', { low: fmt(view.aim.low), high: fmt(view.aim.high) })}
          </AppText>
        ) : null}
      </Card>

      <Card testID="target-live">
        <AppText variant="cardTitle">{t('loadx.target.liveTitle')}</AppText>
        <AppText variant="body" muted>
          {t('loadx.target.live')}
        </AppText>
        <Button label={t('home.startActivity')} variant="secondary" icon="play" onPress={() => router.push('/activity/start')} testID="target-start" />
      </Card>

      <LevelNote level={PARITY.load} text={t('loadTarget.levelNote')} testID="target-level" />
    </Screen>
  );
}
