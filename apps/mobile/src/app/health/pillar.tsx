import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { CONTRIBUTOR_WINDOW_DAYS, contributorById, contributorScale, isContributorId, type ContributorId } from '@/data/contributors';
import { useAppData } from '@/data/context';
import { summarizeBiomarkers } from '@/data/labs';
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
import { formatDuration, formatNumber, formatShortDay, todayIso } from '@/lib/format';
import { useUnits } from '@/lib/units';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip, type ChipTone } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { SemiGauge } from '@/ui/Gauge';
import { CONTRIBUTOR_NAME, contributorReason, contributorSource, contributorStatus, contributorTarget, contributorTone, contributorValue, targetBasis, zoneTone } from '@/ui/health/contributorText';
import { HealthPage } from '@/ui/health/HealthPage';
import { MethodCard } from '@/ui/health/MethodCard';
import type { IconName } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { LevelNote } from '@/ui/LevelNote';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { PARITY } from '@/ui/parity';
import { spacing, useTheme, type ColorTokens } from '@/ui/theme';

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

function toneColor(colors: ColorTokens, tone: ChipTone): string {
  switch (tone) {
    case 'negative':
      return colors.negative;
    case 'warning':
      return colors.warning;
    case 'positive':
      return colors.positive;
    case 'info':
      return colors.info;
    default:
      return colors.textFaint;
  }
}

function ContributorDetail({ id }: { id: ContributorId }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const units = useUnits();
  const { width, gutter } = useLayout();
  const { days, profile, userData, labResults, bodyMeasurements, strength } = useAppData();
  const c = contributorById({ days, profile, sex: userData.sex, sessions: strength.sessions, bodyMeasurements, today: todayIso(new Date(Date.now())) }, id);
  const text = { t, language, units };
  const value = contributorValue(c, text);
  const target = contributorTarget(c, text);
  const scale = contributorScale(c);
  const tone = contributorTone(c);
  const labs = summarizeBiomarkers(labResults);
  const newest = labs.reduce<string | null>((max, s) => (max === null || s.latest.day > max ? s.latest.day : max), null);
  const size = Math.min(300, width - gutter * 2 - 40);
  const status = contributorStatus(c, t);

  return (
    <HealthPage
      title={t(CONTRIBUTOR_NAME[id])}
      testID={`health-contributor-${id}`}
      hero={
        <View style={{ gap: spacing.md, alignItems: 'center' }}>
          {scale === null ? null : (
            <SemiGauge
              size={size}
              stroke={18}
              gap={0.02}
              segments={scale.segments.map((s) => ({ from: s.from, to: s.to, color: toneColor(colors, zoneTone(c, s.zone)) }))}
              marker={scale.position}
              testID="contributor-gauge"
            />
          )}
          {value === null ? (
            <AppText variant="title" muted style={{ textAlign: 'center' }} testID="contributor-reason">
              {contributorReason(c, t)}
            </AppText>
          ) : (
            <Num size={64} testID="contributor-value" style={{ textAlign: 'center' }}>
              {value}
            </Num>
          )}
          {status === null ? null : <Chip label={status} tone={tone} testID="contributor-status" />}
        </View>
      }>
      <Card testID="contributor-compare">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="body" style={{ flexShrink: 1 }}>
            {t('health.contrib.you')}
          </AppText>
          <AppText variant="bodyStrong" numeric muted={value === null} style={{ flexShrink: 1, textAlign: 'right' }}>
            {value ?? contributorReason(c, t)}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="body" style={{ flexShrink: 1 }} testID="contributor-basis">
            {target === null ? t('health.contrib.status.none') : targetBasis(c, t)}
          </AppText>
          {target === null ? null : (
            <AppText variant="bodyStrong" numeric style={{ textAlign: 'right' }} testID="contributor-target">
              {target}
            </AppText>
          )}
        </View>
        {target === null ? (
          <AppText variant="label" muted testID="contributor-target-reason">
            {targetBasis(c, t)}
          </AppText>
        ) : null}
        {id === 'strength' && c.minutes !== null ? (
          <AppText variant="label" muted>
            {t('health.contrib.strengthMinutes', { value: formatNumber(c.minutes, 0, language) })}
          </AppText>
        ) : null}
        <AppText variant="caption" muted>
          {t('health.contrib.window', { weeks: CONTRIBUTOR_WINDOW_DAYS / 7 })}
        </AppText>
      </Card>
      <Card testID="contributor-advice">
        <AppText variant="cardTitle">{t('health.contrib.howTo')}</AppText>
        <AppText variant="body" soft>
          {t(`health.contrib.${id}.advice`)}
        </AppText>
      </Card>
      <ListGroup>
        <ListRow
          testID="contributor-labs"
          title={t('health.contrib.linkedLabs')}
          subtitle={labs.length === 0 || newest === null ? t('health.contrib.labsNone') : t('health.contrib.labsSome', { count: labs.length, day: formatShortDay(newest, language) })}
          icon={{ icon: 'flask', color: colors.positive, background: colors.positiveSoft }}
          href="/health/labs"
        />
        <ListRow testID="contributor-pillars" title={t('health.pillar.title')} subtitle={t('health.hub.pillarsHint')} icon={{ icon: 'target', color: colors.textSoft, background: colors.surfaceAlt }} href="/health/pillar" />
      </ListGroup>
      <LevelNote level={PARITY.pillars} text={t(contributorSource(id, profile.zoneMode === 'custom'))} testID="contributor-source" />
    </HealthPage>
  );
}

export default function PillarScreen() {
  const params = useLocalSearchParams<{ id?: string; contributor?: string }>();
  if (isContributorId(params.contributor)) return <ContributorDetail id={params.contributor} />;
  return <PillarOverview pillarId={params.id} />;
}

function PillarOverview({ pillarId }: { pillarId: string | undefined }) {
  const { t, language } = useT();
  const { days, profile, userData } = useAppData();
  const id = isPillarId(pillarId) ? pillarId : null;
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
