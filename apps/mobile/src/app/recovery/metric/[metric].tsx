import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';

import { useAppData } from '@/data/context';
import { sliceEndingAt, singleParam, TREND_RANGES, type TrendRange } from '@/data/dailyDerived';
import { baselineAt, percentFromBaseline, rangeStatus } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay, formatSigned } from '@/lib/format';
import { formatTemperature, formatTemperatureDelta, temperatureDeltaIn, temperatureIn, temperatureUnit, useUnits } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip, Pill, type ChipTone } from '@/ui/Chip';
import { NoDataPage, Page } from '@/ui/daily/bits';
import { RangeSwitch } from '@/ui/daily/charts';
import { isMetricSlug, METRIC_SLUGS, METRIC_SPECS } from '@/ui/daily/metrics';
import { useExplain, useMissing, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { missingStatus } from '@/ui/explain/whyText';
import { LevelNote } from '@/ui/LevelNote';
import { LineChart } from '@/ui/LineChart';
import { Num } from '@/ui/Num';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

function scrollChipsTo(scroller: ScrollViewInstance | null, x: number): void {
  scroller?.scrollTo({ x: Math.max(0, x - spacing.lg), animated: false });
}

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
  const units = useUnits();
  const [range, setRange] = useState<TrendRange>('1M');
  const slug = singleParam(params.metric);
  const chipsRef = useRef<ScrollViewInstance>(null);
  const chipX = useRef(new Map<string, number>());
  const onChipLayout = (s: string, event: LayoutChangeEvent): void => {
    chipX.current.set(s, event.nativeEvent.layout.x);
    if (s === slug) scrollChipsTo(chipsRef.current, event.nativeEvent.layout.x);
  };
  useEffect(() => {
    const x = slug === null ? undefined : chipX.current.get(slug);
    if (x !== undefined) scrollChipsTo(chipsRef.current, x);
  }, [slug]);
  const index = days.length - 1;
  const day = days[index];

  if (!isMetricSlug(slug)) return <NoDataPage title={t('metricDetail.title')} body={t('metricDetail.unknown')} />;
  const spec = METRIC_SPECS[slug];
  const title = t(`readinessShort.${slug}`);
  if (!day) return <NoDataPage title={title} body={t('empty.body')} />;

  const temp = slug === 'temp';
  const show = (celsiusOrValue: number): number => (temp ? temperatureIn(celsiusOrValue, units) : celsiusOrValue);
  const unit = temp ? temperatureUnit(units) : t(spec.unit);
  const withUnit = (text: string): string => (unit === '%' ? `${text}%` : `${text} ${unit}`);
  const derived = spec.pick(day);
  const baseline = baselineAt(days, index, spec.key);
  const status = rangeStatus(derived.value, baseline);
  const pct = percentFromBaseline(derived.value, baseline);
  const slice = sliceEndingAt(days, TREND_RANGES[range]);
  const values = slice.map((d) => {
    const v = spec.pick(d).value;
    return v === null ? null : show(v);
  });
  const first = slice[0];
  const name = t(spec.label);
  const valueText = derived.value === null ? null : formatNumber(show(derived.value), spec.decimals, language);
  const target: ExplainTarget = { term: spec.term, index, shown: { value: valueText, unit, reason: derived.reason } };
  const deviation = temp ? day.skinTempDeviationC : null;
  const deviationShown = deviation === null || deviation.value === null ? null : formatTemperatureDelta(deviation.value, units, language);
  const heroValue = temp ? (deviationShown?.value ?? null) : valueText;
  const heroUnit = temp ? (deviationShown?.unit ?? unit) : unit;
  const heroTarget: ExplainTarget = temp && deviation !== null ? { term: 'skinTempChange', index, shown: { value: heroValue, unit: heroUnit, reason: deviation.reason } } : target;

  const chip: { label: string; tone: ChipTone; testID: string } | null = (() => {
    if (derived.value === null || baseline === null) return derived.value === null ? null : { label: t('range.calibrating'), tone: 'neutral', testID: 'chip-status' };
    if (status === 'within') return { label: t('metricScreen.status.within'), tone: 'positive', testID: 'chip-status' };
    const gap = temp
      ? `${formatNumber(temperatureDeltaIn(Math.abs(derived.value - baseline.mean), units), 1, language)} ${unit}`
      : `${formatNumber(Math.abs(pct ?? 0), 0, language)}%`;
    return { label: t(status === 'above' ? 'metricScreen.status.over' : 'metricScreen.status.under', { value: gap }), tone: 'warning', testID: 'chip-status' };
  })();

  return (
    <Page
      title={title}
      tint="recovery"
      right={<IconButton icon="info" label={t('explain.whatIs', { name })} onPress={() => explain.about(target)} testID="metric-about" />}
      testID="metric-detail"
      hero={
        <View style={{ gap: spacing.lg }}>
          <ScrollView ref={chipsRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} testID="metric-chips">
            {METRIC_SLUGS.map((s) => (
              <View key={s} onLayout={(event) => onChipLayout(s, event)} testID={`pill-wrap-${s}`}>
                <Pill testID={`pill-${s}`} label={t(`readinessShort.${s}`)} selected={s === slug} onPress={() => router.replace(`/recovery/metric/${s}`)} />
              </View>
            ))}
          </ScrollView>
          <View style={{ gap: spacing.sm }}>
            <AppText variant="cap" soft>
              {t('metricDetail.lastNight')}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
              {heroValue === null ? (
                <MissingHero target={heroTarget} />
              ) : (
                <Num size={80} unit={heroUnit} unitSize={36} unitColor={colors.textMuted} testID="metric-value">
                  {heroValue}
                </Num>
              )}
              {chip && !temp ? (
                <View style={{ paddingBottom: 6 }}>
                  <Chip label={chip.label} tone={chip.tone} testID={chip.testID} />
                </View>
              ) : null}
            </View>
            {temp && valueText !== null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
                <AppText variant="label" muted testID="metric-absolute">
                  {t('metricScreen.measuredTemp', { value: withUnit(valueText) })}
                </AppText>
                {chip ? <Chip label={chip.label} tone={chip.tone} testID={chip.testID} /> : null}
              </View>
            ) : null}
          </View>
        </View>
      }>
      <Card style={{ gap: spacing.md }} testID="card-baseline">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
          <AppText variant="cap" muted>
            {t('metricDetail.baseline')}
          </AppText>
          {baseline ? (
            <Num size={22} testID="baseline-mean">
              {withUnit(temp ? formatTemperature(baseline.mean, units, language).value : formatNumber(baseline.mean, spec.decimals, language))}
            </Num>
          ) : null}
        </View>
        {baseline ? (
          <View style={{ gap: 4 }}>
            <AppText variant="label" muted testID="baseline-range">
              {t('metricDetail.normalRange', {
                low: formatNumber(show(baseline.low), spec.decimals, language),
                high: formatNumber(show(baseline.high), spec.decimals, language),
                unit,
              })}
            </AppText>
            <AppText variant="caption" muted>
              {t('metricDetail.baselineNights', { count: baseline.count })}
            </AppText>
            {pct === null || temp ? null : (
              <AppText variant="caption" muted testID="baseline-pct">
                {Math.round(pct) === 0 ? t('daily.vsBaselineSame') : t('daily.vsBaseline', { value: formatSigned(Math.round(pct), 0, language) })}
              </AppText>
            )}
          </View>
        ) : (
          <AppText variant="body" muted testID="baseline-none">
            {t('metricDetail.baselineNone')}
          </AppText>
        )}
      </Card>

      <RangeSwitch value={range} onChange={setRange} />
      <Card style={{ gap: spacing.md }}>
        <AppText variant="cap" muted>
          {t('metricScreen.chartTitle', { metric: title, days: TREND_RANGES[range] })}
        </AppText>
        <LineChart
          testID="chart-metric"
          data={values}
          minSpan={temp ? temperatureDeltaIn(spec.minSpan, units) : spec.minSpan}
          color={colors.text}
          band={baseline ? { low: show(baseline.low), high: show(baseline.high) } : null}
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

      <Card style={{ gap: spacing.md }}>
        <AppText variant="cardTitle">{t('metricDetail.whatItMeans')}</AppText>
        <AppText variant="body" soft>
          {t(spec.meaning)}
        </AppText>
      </Card>

      <LevelNote level={spec.level} text={t(spec.method)} testID="metric-level" />
    </Page>
  );
}
