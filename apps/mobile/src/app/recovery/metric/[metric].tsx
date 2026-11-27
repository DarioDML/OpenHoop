import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useAppData } from '@/data/context';
import { sliceEndingAt, singleParam, TREND_RANGES, type TrendRange } from '@/data/dailyDerived';
import { baselineAt } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip, Pill } from '@/ui/Chip';
import { NoDataPage, Page, usePercentChip, useRangeChip } from '@/ui/daily/bits';
import { RangeSwitch } from '@/ui/daily/charts';
import { isMetricSlug, METRIC_SLUGS, METRIC_SPECS } from '@/ui/daily/metrics';
import { LineChart } from '@/ui/LineChart';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { useExplain, useMissing, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { missingStatus } from '@/ui/explain/whyText';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

function MissingHero({ target }: { target: ExplainTarget }) {
  const { t, language } = useT();
  const explain = useExplain();
  const missing = useMissing(target);
  const status = missing === null ? t('why.noNumber') : missingStatus(t, language, missing, 'row');
  return (
    <Pressable accessibilityRole="button" testID="metric-why" onPress={() => explain.why(target)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText variant="cardTitle" muted testID="metric-reason">
        {`${status} ›`}
      </AppText>
    </Pressable>
  );
}

export default function MetricDetailScreen() {
  const params = useLocalSearchParams<{ metric?: string | string[] }>();
  const { days } = useAppData();
  const { t, language } = useT();
  const explain = useExplain();
  const { colors } = useTheme();
  const rangeChip = useRangeChip();
  const percentChip = usePercentChip();
  const [range, setRange] = useState<TrendRange>('1M');
  const slug = singleParam(params.metric);
  const index = days.length - 1;
  const day = days[index];

  if (!isMetricSlug(slug)) return <NoDataPage title={t('metricDetail.title')} body={t('metricDetail.unknown')} />;
  const spec = METRIC_SPECS[slug];
  if (!day) return <NoDataPage title={t(spec.label)} body={t('empty.body')} />;

  const derived = spec.pick(day);
  const baseline = baselineAt(days, index, spec.key);
  const chip = rangeChip(derived.value, baseline, spec.decimals);
  const pct = percentChip(derived.value, baseline);
  const slice = sliceEndingAt(days, TREND_RANGES[range]);
  const values = slice.map((d) => spec.pick(d).value);
  const first = slice[0];
  const unit = t(spec.unit);
  const name = t(spec.label);
  const valueText = derived.value === null ? null : formatNumber(derived.value, spec.decimals, language);
  const target: ExplainTarget = { term: spec.term, index, shown: { value: valueText, unit, reason: derived.reason } };

  return (
    <Page
      title={t(spec.label)}
      tint="recovery"
      right={<IconButton icon="info" label={t('explain.whatIs', { name })} onPress={() => explain.about(target)} testID="metric-about" />}
      testID="metric-detail"
      hero={
        <View style={{ gap: spacing.md }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {METRIC_SLUGS.map((s) => (
              <Pill key={s} testID={`pill-${s}`} label={t(METRIC_SPECS[s].label)} selected={s === slug} onPress={() => router.replace(`/recovery/metric/${s}`)} />
            ))}
          </ScrollView>
          <View style={{ gap: 6 }}>
            <AppText variant="capSmall" muted>
              {t('metricDetail.lastNight')}
            </AppText>
            {valueText === null ? (
              <MissingHero target={target} />
            ) : (
              <Num size={64} unit={unit} testID="metric-value">
                {valueText}
              </Num>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {pct ? <Chip label={pct.label} tone={pct.tone} testID="chip-pct" /> : null}
              {chip ? <Chip label={chip.label} tone={chip.tone} testID="chip-range" /> : null}
            </View>
          </View>
        </View>
      }>
      <Card style={{ gap: spacing.sm }} testID="card-baseline">
        <AppText variant="capSmall" muted>
          {t('metricDetail.baseline')}
        </AppText>
        {baseline ? (
          <>
            <AppText variant="value" numeric testID="baseline-mean">
              {formatNumber(baseline.mean, spec.decimals, language)} {unit}
            </AppText>
            <AppText variant="label" muted testID="baseline-range">
              {t('metricDetail.normalRange', { low: formatNumber(baseline.low, spec.decimals, language), high: formatNumber(baseline.high, spec.decimals, language), unit })}
            </AppText>
            <AppText variant="caption" muted>
              {t('metricDetail.baselineNights', { count: baseline.count })}
            </AppText>
          </>
        ) : (
          <AppText variant="body" muted testID="baseline-none">
            {t('metricDetail.baselineNone')}
          </AppText>
        )}
      </Card>

      <RangeSwitch value={range} onChange={setRange} />
      <Card style={{ gap: spacing.md }}>
        <AppText variant="bodyStrong">{t('metricDetail.chartTitle', { metric: t(spec.label) })}</AppText>
        <LineChart
          testID="chart-metric"
          data={values}
          minSpan={spec.minSpan}
          color={colors.accent}
          band={baseline ? { low: baseline.low, high: baseline.high } : null}
          formatTick={(v) => formatNumber(v, spec.decimals, language)}
          emptyLabel={t('trends.noValues')}
          startLabel={first ? formatShortDay(first.day, language) : undefined}
          endLabel={formatShortDay(day.day, language)}
        />
        {baseline ? (
          <AppText variant="caption" muted>
            {t('metricDetail.bandNote')}
          </AppText>
        ) : null}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="cardTitle">{t('metricDetail.whatItMeans')}</AppText>
        <AppText variant="body" muted>
          {t(spec.meaning)}
        </AppText>
      </Card>

      <Card tone="outline" style={{ gap: spacing.sm }}>
        <ParityBadge level={spec.level} long />
        <AppText variant="caption" muted>
          {t(spec.method)}
        </AppText>
      </Card>
    </Page>
  );
}
