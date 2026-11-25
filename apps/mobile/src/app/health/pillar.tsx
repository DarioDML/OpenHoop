import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import {
  PILLAR_IDS,
  PILLAR_MIN_NIGHTS,
  isPillarId,
  healthspanPillars,
  type BaselineComparison,
  type HealthspanPillars,
  type PillarId,
} from '@/data/healthspanDerived';
import type { TranslationKey } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import type { Language } from '@/data/types';
import { formatDuration, formatNumber, formatShortDay } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { MethodCard } from '@/ui/health/MethodCard';
import type { IconName } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { PARITY } from '@/ui/parity';
import { spacing, useTheme } from '@/ui/theme';

const ICONS: Record<PillarId, IconName> = { sleep: 'moon', recovery: 'heart', activity: 'steps', fitness: 'lungs' };

function positionText(t: TFunction, comparison: BaselineComparison | null): string {
  return comparison === null ? t('health.pillar.summary.unknownPosition') : t(`health.pillar.position.${comparison.position}`);
}

function summary(t: TFunction, language: Language, id: PillarId, pillars: HealthspanPillars): string {
  switch (id) {
    case 'sleep':
      return pillars.sleep === null ? t('health.pillar.empty') : t('health.pillar.summary.sleep', { asleep: formatDuration(t, pillars.sleep.meanAsleepS) });
    case 'recovery':
      return pillars.hrv === null && pillars.rhr === null
        ? t('health.pillar.empty')
        : t('health.pillar.summary.recovery', { hrv: positionText(t, pillars.hrv), rhr: positionText(t, pillars.rhr) });
    case 'activity':
      return pillars.activity === null ? t('health.pillar.empty') : t('health.pillar.summary.activity', { minutes: pillars.activity.activeMinutes });
    case 'fitness':
      return pillars.fitness.result.ok
        ? t('health.pillar.summary.fitness', { value: formatNumber(pillars.fitness.result.value.vo2max, 0, language) })
        : t('health.pillar.empty');
  }
}

function Overview({ pillars }: { pillars: HealthspanPillars }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  return (
    <ListGroup title={pillars.endDay === null ? undefined : t('health.pillar.upTo', { day: formatShortDay(pillars.endDay, language) })}>
      {PILLAR_IDS.map((id) => (
        <ListRow
          key={id}
          testID={`pillar-row-${id}`}
          title={t(`health.pillar.name.${id}`)}
          subtitle={summary(t, language, id, pillars)}
          icon={{ icon: ICONS[id], color: colors.textSoft, background: colors.surfaceAlt }}
          onPress={() => router.push({ pathname: '/health/pillar', params: { id } })}
        />
      ))}
    </ListGroup>
  );
}

function Baseline({ label, unit, comparison, decimals, testID }: { label: string; unit: string; comparison: BaselineComparison | null; decimals: number; testID: string }) {
  const { t, language } = useT();
  const fmt = (value: number): string => formatNumber(value, decimals, language);
  return (
    <Card testID={testID}>
      <AppText variant="capLarge" muted>
        {label}
      </AppText>
      {comparison === null ? (
        <AppText variant="body" muted testID={`${testID}-missing`}>
          {t('health.pillar.recovery.missing')}
        </AppText>
      ) : (
        <>
          <AppText variant="bodyStrong" testID={`${testID}-position`}>
            {positionText(t, comparison)}
          </AppText>
          <AppText variant="label" soft numeric>
            {t('health.pillar.recovery.recent', { value: fmt(comparison.recentMean), unit, count: comparison.recentCount })}
          </AppText>
          <AppText variant="label" muted numeric>
            {t('health.pillar.recovery.baseline', {
              low: fmt(comparison.baselineMean - comparison.baselineSd),
              high: fmt(comparison.baselineMean + comparison.baselineSd),
              unit,
              count: comparison.baselineCount,
            })}
          </AppText>
        </>
      )}
    </Card>
  );
}

function Detail({ id, pillars }: { id: PillarId; pillars: HealthspanPillars }) {
  const { t, language } = useT();
  const fmt = (value: number, decimals = 0): string => formatNumber(value, decimals, language);
  const notSet = t('health.pillar.noValue');
  let inputs: string;
  let method: TranslationKey;
  let body: ReactNode;
  switch (id) {
    case 'sleep': {
      const sleep = pillars.sleep;
      inputs = t('health.pillar.sleep.inputs', { nights: sleep?.nights ?? 0 });
      method = 'health.pillar.sleep.method';
      body =
        sleep === null ? (
          <AppText variant="body" muted testID="pillar-sleep-empty">
            {t('health.pillar.sleep.empty', { min: PILLAR_MIN_NIGHTS })}
          </AppText>
        ) : (
          <Card testID="pillar-sleep">
            <StatRow>
              <StatTile label={t('health.pillar.sleep.asleep')} value={formatDuration(t, sleep.meanAsleepS)} testID="pillar-sleep-asleep" />
              <StatTile label={t('health.pillar.sleep.need')} value={sleep.meanNeedS === null ? notSet : formatDuration(t, sleep.meanNeedS)} />
            </StatRow>
            <StatRow>
              <StatTile label={t('health.pillar.sleep.ofNeed')} value={sleep.needRatio === null ? notSet : fmt(sleep.needRatio * 100)} unit={sleep.needRatio === null ? undefined : '%'} />
              <StatTile
                label={t('health.pillar.sleep.consistency')}
                value={sleep.meanConsistency === null ? notSet : fmt(sleep.meanConsistency)}
                unit={sleep.meanConsistency === null ? undefined : '%'}
              />
            </StatRow>
            <AppText variant="body" soft testID="pillar-sleep-reference">
              {sleep.meetsReference ? t('health.pillar.sleep.met') : t('health.pillar.sleep.notMet')}
            </AppText>
          </Card>
        );
      break;
    }
    case 'recovery':
      inputs = t('health.pillar.recovery.inputs');
      method = 'health.pillar.recovery.method';
      body = (
        <>
          <Baseline label={t('metric.hrv')} unit={t('unit.ms')} comparison={pillars.hrv} decimals={0} testID="pillar-hrv" />
          <Baseline label={t('metric.restingHr')} unit={t('unit.bpm')} comparison={pillars.rhr} decimals={0} testID="pillar-rhr" />
        </>
      );
      break;
    case 'activity': {
      const activity = pillars.activity;
      inputs = t('health.pillar.activity.inputs');
      method = 'health.pillar.activity.method';
      body =
        activity === null ? (
          <AppText variant="body" muted testID="pillar-activity-empty">
            {t('health.pillar.activity.empty')}
          </AppText>
        ) : (
          <Card testID="pillar-activity">
            <StatRow>
              <StatTile label={t('health.pillar.activity.minutes')} value={fmt(activity.activeMinutes)} unit={t('health.pillar.unitMin')} testID="pillar-activity-minutes" />
            </StatRow>
            <AppText variant="label" muted>
              {t('health.pillar.activity.reference')}
            </AppText>
            <AppText variant="body" soft testID="pillar-activity-status">
              {t(`health.pillar.activity.status.${activity.status}`)}
            </AppText>
            <AppText variant="caption" muted>
              {t('health.pillar.activity.days', { days: activity.measuredDays, full: activity.fullDays })}
            </AppText>
          </Card>
        );
      break;
    }
    case 'fitness': {
      const fitness = pillars.fitness;
      inputs = t('health.pillar.fitness.inputs');
      method = 'health.pillar.fitness.method';
      body = (
        <Card testID="pillar-fitness">
          <AppText variant="body" soft testID="pillar-fitness-summary">
            {summary(t, language, 'fitness', pillars)}
          </AppText>
          {fitness.norm !== null ? (
            <AppText variant="body" soft testID="pillar-fitness-position">
              {t(`health.vo2max.norm.${fitness.norm.position}`)}
            </AppText>
          ) : fitness.result.ok ? (
            <AppText variant="label" muted>
              {t(`health.vo2max.norm.reason.${fitness.normReason ?? 'no-age'}`)}
            </AppText>
          ) : null}
          <Button label={t('health.pillar.fitness.open')} variant="secondary" onPress={() => router.push('/health/vo2max')} testID="pillar-fitness-open" />
        </Card>
      );
      break;
    }
  }
  return (
    <>
      {body}
      <Card testID="pillar-inputs">
        <AppText variant="capLarge" muted>
          {t('health.pillar.inputs')}
        </AppText>
        <AppText variant="label" soft>
          {inputs}
        </AppText>
      </Card>
      <MethodCard testID="pillar-method" level={PARITY.pillars} title={t('health.pillar.method')} lines={[t(method)]} />
    </>
  );
}

export default function PillarScreen() {
  const { t, language } = useT();
  const { days, profile, userData } = useAppData();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = isPillarId(params.id) ? params.id : null;
  const pillars = healthspanPillars(days, profile, userData.sex);
  const title = id === null ? t('health.pillar.title') : t(`health.pillar.name.${id}`);

  return (
    <HealthPage
      title={title}
      testID={id === null ? 'health-pillar' : `health-pillar-${id}`}
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {id === null ? t('health.pillar.heading') : title}
          </AppText>
          {id === null ? (
            <AppText variant="lead" muted>
              {t('health.pillar.body')}
            </AppText>
          ) : pillars.endDay !== null ? (
            <AppText variant="label" muted>
              {t('health.pillar.upTo', { day: formatShortDay(pillars.endDay, language) })}
            </AppText>
          ) : null}
        </View>
      }>
      {id === null ? <Overview pillars={pillars} /> : <Detail id={id} pillars={pillars} />}
    </HealthPage>
  );
}
