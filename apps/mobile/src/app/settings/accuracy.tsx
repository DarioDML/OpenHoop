import { STAGE_VALIDATION } from '@openhoop/analytics';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Share, View } from 'react-native';

import { MIN_PAIRS, STAGES_KAPPA_TARGET, compareWithOfficial, summarise, type AccuracyMetric, type MetricComparison } from '@/data/accuracy';
import { useAppData } from '@/data/context';
import type { Language, Units } from '@/data/types';
import { countKey, type TranslationKey } from '@/i18n';
import { useT, type TFunction } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { temperatureUnit, useUnits } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { useLayout } from '@/ui/layout';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { tile } from '@/ui/manage/tiles';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';

const LABELS: Readonly<Record<keyof typeof PARITY, TranslationKey>> = {
  heartRate: 'metric.heartRate',
  rr: 'metric.rr',
  steps: 'metric.steps',
  wearTime: 'metric.wearTime',
  skinTemp: 'metric.skinTemp',
  spo2: 'metric.spo2',
  batteryPack: 'device.pack.charge',
  hrv: 'metric.hrv',
  restingHr: 'metric.restingHr',
  respiratoryRate: 'metric.respiratoryRate',
  sleep: 'sleep.summary',
  sleepNeed: 'metric.need',
  sleepScore: 'metric.sleepScore',
  readiness: 'score.readiness',
  load: 'score.load',
  zones: 'load.zones',
  consistency: 'metric.consistency',
  workouts: 'load.workouts',
  calories: 'calories.title',
  stress: 'health.stress.title',
  stages: 'stage.title',
  jetLag: 'sleepx.jetLag',
  vo2max: 'health.metrics.vo2max',
  pillars: 'health.hub.pillars',
  bodyAge: 'health.hub.bodyAge',
  route: 'route.accuracyLabel',
};

const KEYS = Object.keys(PARITY) as ReadonlyArray<keyof typeof PARITY>;

const METRIC_LABEL: Readonly<Record<AccuracyMetric, TranslationKey>> = {
  readiness: 'score.readiness',
  load: 'score.load',
  sleepScore: 'metric.sleepScore',
  hrv: 'metric.hrv',
  restingHr: 'metric.restingHr',
  respiratoryRate: 'metric.respiratoryRate',
  spo2: 'metric.spo2',
  skinTemp: 'metric.skinTemp',
};

function inUnits(metric: AccuracyMetric, value: number, units: Units): number {
  return metric === 'skinTemp' && units === 'imperial' ? (value * 9) / 5 : value;
}

function errorText(t: TFunction, language: Language, metric: AccuracyMetric, value: number, units: Units): string {
  const shown = inUnits(metric, value, units);
  switch (metric) {
    case 'readiness':
    case 'sleepScore':
      return `±${formatNumber(shown, 1, language)} ${t('aboutx.accuracy.pts')}`;
    case 'load':
      return `±${formatNumber(shown, 2, language)}`;
    case 'hrv':
      return `±${formatNumber(shown, 1, language)} ${t('aboutx.accuracy.ms')}`;
    case 'restingHr':
      return `±${formatNumber(shown, 1, language)} ${t('aboutx.accuracy.bpm')}`;
    case 'respiratoryRate':
      return `±${formatNumber(shown, 1, language)} ${t('aboutx.accuracy.perMin')}`;
    case 'spo2':
      return `±${formatNumber(shown, 1, language)} ${t('aboutx.accuracy.pt')}`;
    case 'skinTemp':
      return `±${formatNumber(shown, 2, language)} ${temperatureUnit(units)}`;
  }
}

function targetText(language: Language, metric: AccuracyMetric, target: number, units: Units): string {
  const shown = inUnits(metric, target, units);
  const decimals = metric === 'load' ? 1 : metric === 'skinTemp' ? 2 : Number.isInteger(shown) ? 0 : 1;
  return formatNumber(shown, decimals, language);
}

interface ResultRowProps {
  title: string;
  subtitle: string;
  value: string | null;
  pass: boolean | null;
  target: string | null;
  testID: string;
}

function ResultRow({ title, subtitle, value, pass, target, testID }: ResultRowProps) {
  const { t } = useT();
  const { compact } = useLayout();
  const chip =
    value === null ? (
      <Chip label={t('aboutx.accuracy.notMeasured')} small testID={`${testID}-status`} />
    ) : target === null ? (
      <Chip label={t('aboutx.accuracy.noTarget')} small testID={`${testID}-status`} />
    ) : (
      <Chip label={`${pass === true ? '✓' : '!'} ${t('aboutx.accuracy.target', { target })}`} tone={pass === true ? 'positive' : 'warning'} testID={`${testID}-target`} />
    );
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72, paddingVertical: spacing.md }}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }} testID={`${testID}-text`}>
        <AppText variant="body" style={{ fontWeight: '500', fontSize: 17 }}>
          {title}
        </AppText>
        <AppText variant="label" muted>
          {subtitle}
        </AppText>
        {compact ? <View style={{ flexDirection: 'row', marginTop: 3 }}>{chip}</View> : null}
      </View>
      {value === null ? (
        compact ? null : chip
      ) : (
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Num size={24} testID={`${testID}-value`}>
            {value}
          </Num>
          {compact ? null : chip}
        </View>
      )}
    </View>
  );
}

export default function AccuracyScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { compact } = useLayout();
  const units = useUnits();
  const { days, vendorData, userData } = useAppData();
  const useImport = userData.vendorUse.accuracy;
  const comparisons = useMemo<MetricComparison[]>(
    () => (useImport ? compareWithOfficial(days, vendorData) : compareWithOfficial(days, { cycles: [], sleeps: [], workouts: [], journal: [] })),
    [days, vendorData, useImport],
  );
  const summary = summarise(comparisons);
  const measured = new Set<string>([...comparisons.filter((comparison) => comparison.meanAbsError !== null).map((comparison) => comparison.metric), 'stages']);
  const stagesKappa = formatNumber(STAGE_VALIDATION.kappa, 2, language);
  const stagesPass = STAGE_VALIDATION.kappa >= STAGES_KAPPA_TARGET;
  const vsOfficial = (pairs: number): string => t(countKey(pairs, 'aboutx.accuracy.vsOfficialOne', 'aboutx.accuracy.vsOfficial'), { count: pairs });
  const title =
    summary.withTarget > 0
      ? t('aboutx.accuracy.summary', { passing: summary.passing, total: summary.withTarget })
      : summary.measured > 0
        ? summary.measured === 1
          ? t('aboutx.accuracy.summaryNoTargetOne')
          : t('aboutx.accuracy.summaryNoTarget', { count: summary.measured })
        : t('aboutx.accuracy.summaryNone');

  const share = (): void => {
    const lines = comparisons.map((comparison) => {
      const result =
        comparison.meanAbsError === null
          ? t('aboutx.accuracy.reportNotMeasured')
          : `${errorText(t, language, comparison.metric, comparison.meanAbsError, units)} (${vsOfficial(comparison.pairs)})`;
      return `${t(METRIC_LABEL[comparison.metric])}: ${result}`;
    });
    lines.push(`${t('stage.title')}: κ ${stagesKappa} (${t('aboutx.accuracy.vsLab', { people: STAGE_VALIDATION.subjects })})`);
    void Share.share({ title: t('aboutx.accuracy.reportTitle'), message: [t('aboutx.accuracy.reportTitle'), title, '', ...lines].join('\n') });
  };

  const header = (
    <>
      <TopBar title={t('aboutx.accuracy.title')} right={<IconButton icon="share" label={t('aboutx.accuracy.share')} onPress={share} color={colors.text} testID="accuracy-share" />} />
      <View style={{ gap: spacing.sm }} testID="accuracy-hero">
        <AppText variant="capLarge" soft>
          {summary.nights === 0 ? t('aboutx.accuracy.eyebrowNone') : t(countKey(summary.nights, 'aboutx.accuracy.eyebrowOne', 'aboutx.accuracy.eyebrow'), { nights: summary.nights })}
        </AppText>
        <AppText variant="h1" accessibilityRole="header" testID="accuracy-summary">
          {title}
        </AppText>
        {summary.measured === 0 ? (
          <AppText variant="body" soft>
            {useImport ? t('aboutx.accuracy.noneBody') : t('aboutx.accuracy.turnedOff')}
          </AppText>
        ) : null}
      </View>
    </>
  );

  return (
    <Screen header={header} tint="neutral" testID="accuracy">
      <ListGroup>
        {comparisons.map((comparison) => (
          <ResultRow
            key={comparison.metric}
            testID={`accuracy-result-${comparison.metric}`}
            title={t(METRIC_LABEL[comparison.metric])}
            subtitle={
              comparison.meanAbsError === null
                ? t('aboutx.accuracy.vsOfficialFew', { count: comparison.pairs, min: MIN_PAIRS })
                : vsOfficial(comparison.pairs)
            }
            value={comparison.meanAbsError === null ? null : errorText(t, language, comparison.metric, comparison.meanAbsError, units)}
            pass={comparison.pass}
            target={comparison.target === null ? null : targetText(language, comparison.metric, comparison.target, units)}
          />
        ))}
        <ResultRow
          testID="accuracy-result-stages"
          title={t('stage.title')}
          subtitle={t('aboutx.accuracy.vsLab', { people: STAGE_VALIDATION.subjects })}
          value={`${t('aboutx.accuracy.kappa')} ${stagesKappa}`}
          pass={stagesPass}
          target={formatNumber(STAGES_KAPPA_TARGET, 1, language)}
        />
      </ListGroup>
      <AppText variant="label" muted>
        {t('aboutx.accuracy.footnote')}
      </AppText>
      <AppText variant="caption" muted>
        {t('aboutx.accuracy.stagesNote')}
      </AppText>
      <Button label={t('aboutx.accuracy.import')} icon="export" variant="soft" onPress={() => router.push('/settings/import')} testID="accuracy-import" />

      <CapHeader title={t('aboutx.accuracy.perValue')} />
      <Card style={{ gap: spacing.md }}>
        <AppText variant="label" muted>
          {t('aboutx.accuracy.body')}
        </AppText>
        {KEYS.map((key) => {
          const chip = measured.has(key) ? <Chip label={t('aboutx.accuracy.measured')} tone="positive" small /> : <Chip label={t('aboutx.accuracy.notMeasured')} small />;
          return (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 }} testID={`accuracy-${key}`}>
              <ParityBadge level={PARITY[key]} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <AppText variant="body">{t(LABELS[key])}</AppText>
                {compact ? chip : null}
              </View>
              {compact ? null : chip}
            </View>
          );
        })}
      </Card>

      <ListGroup>
        <ListRow
          icon={tile(colors, 'export', 'purple')}
          title={t('aboutx.donateData.row')}
          subtitle={t('aboutx.donateData.rowBody')}
          href="/settings/donate-data"
          testID="accuracy-donate-data"
        />
      </ListGroup>
    </Screen>
  );
}
