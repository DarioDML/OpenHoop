import { router, type Href } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { MIN_BASELINE_NIGHTS, type Baseline } from '@/data/derived';
import { latestVitalsIndex, vitalReadings, vitalsSummary, type VitalId, type VitalReading } from '@/data/healthDerived';
import { buildingProgress, remaining } from '@/data/progress';
import { TERMS, type TermId } from '@/data/terms';
import type { Language, Units } from '@/data/types';
import { useT } from '@/i18n/useT';
import { formatAgo, formatNumber, formatShortDay } from '@/lib/format';
import { formatTemperature, formatTemperatureDelta, temperatureIn, temperatureUnit, useUnits } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { useExplain, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { MetricName } from '@/ui/explain/MetricName';
import { ProgressDots } from '@/ui/explain/ProgressDots';
import { HealthPage } from '@/ui/health/HealthPage';
import { rangeChip } from '@/ui/health/rangeChip';
import { useLiveHeartRate } from '@/ui/health/useLiveHeartRate';
import { Icon } from '@/ui/Icon';
import { LevelNote } from '@/ui/LevelNote';
import { MetricTile, MissingValue } from '@/ui/MetricTile';
import { Num } from '@/ui/Num';
import { Sparkline } from '@/ui/Sparkline';
import { StateCard } from '@/ui/StateCard';
import { radius, spacing, useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

const GRID: ReadonlyArray<readonly VitalId[]> = [['hrv', 'rhr'], ['resp', 'spo2'], ['temp']];

interface Shown {
  value: (v: number) => string;
  unit: string;
  baseline: Baseline | null;
}

function shownFor(reading: VitalReading, units: Units, language: Language, unitText: string): Shown {
  if (reading.spec.id !== 'temp') {
    return { value: (v) => formatNumber(v, reading.spec.decimals, language), unit: unitText, baseline: reading.baseline };
  }
  const { baseline } = reading;
  return {
    value: (v) => formatTemperature(v, units, language, reading.spec.decimals).value,
    unit: temperatureUnit(units),
    baseline: baseline === null ? null : { ...baseline, mean: temperatureIn(baseline.mean, units), low: temperatureIn(baseline.low, units), high: temperatureIn(baseline.high, units) },
  };
}

function LiveHero(): ReactElement | null {
  const { t } = useT();
  const { colors } = useTheme();
  const live = useLiveHeartRate();
  if (!live.active || live.current === null) return null;
  return (
    <View style={{ gap: spacing.sm }} testID="vitals-live">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.negative }} />
        <AppText variant="capLarge" color={colors.positive}>
          {t('health.vitals.live')}
        </AppText>
      </View>
      <Num size={88} unit={t('unit.bpm')} unitSize={30} unitColor={colors.textMuted} testID="vitals-live-value">
        {Math.round(live.current)}
      </Num>
      <Sparkline data={live.series} color={colors.negative} height={44} baseline endDot accessibilityLabel={t('health.vitals.liveChart')} testID="vitals-live-chart" />
    </View>
  );
}

function VitalRow({ reading, index, shown, last, testID }: { reading: VitalReading; index: number; shown: Shown; last: boolean; testID: string }): ReactElement {
  const { t } = useT();
  const { colors } = useTheme();
  const target: ExplainTarget = { term: reading.spec.term, index, shown: { value: reading.value === null ? null : shown.value(reading.value), unit: shown.unit, reason: reading.reason } };
  const line = TERMS[reading.spec.term].short;
  const href: Href = `/recovery/metric/${reading.spec.id}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(reading.spec.labelKey)}
      onPress={() => router.push(href)}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 72,
        paddingVertical: spacing.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.8 : 1,
      })}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <MetricName target={target} label={t(reading.spec.labelKey)} variant="bodyStrong" muted={false} testID={`${testID}-name`} />
        {line === null ? null : (
          <AppText variant="label" muted>
            {t(line)}
          </AppText>
        )}
      </View>
      {reading.value !== null ? (
        <Num size={30} unit={shown.unit} unitSize={16} unitColor={colors.textMuted} testID={`${testID}-value`}>
          {shown.value(reading.value)}
        </Num>
      ) : (
        <MissingValue target={target} testID={testID} />
      )}
    </Pressable>
  );
}

function BandStatus(): ReactElement {
  const { t } = useT();
  const { colors } = useTheme();
  const { device } = useAppData();
  const explain = useExplain();
  const synced = device.lastSyncAt !== null;
  return (
    <Card testID="vitals-band-status" style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Icon name={synced ? 'check' : 'sync'} size={18} color={synced ? colors.positive : colors.textMuted} strokeWidth={2} />
        <AppText variant="body" numeric style={{ flex: 1 }}>
          {[device.batteryPercent === null ? t('health.vitals.band') : t('health.vitals.bandBattery', { pct: device.batteryPercent }), synced ? t('health.vitals.storedLocal') : t('health.vitals.nothingStored')].join(' · ')}
        </AppText>
      </View>
      <AppText variant="label" muted testID="vitals-last-sync">
        {device.lastSyncAt === null ? t('health.vitals.notSynced') : t('health.vitals.lastSync', { ago: formatAgo(t, explain.nowS(), device.lastSyncAt) })}
      </AppText>
    </Card>
  );
}

export default function VitalsScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const units = useUnits();
  const { days, sync } = useAppData();
  const [refreshing, setRefreshing] = useState(false);
  const index = latestVitalsIndex(days);
  const day = days[index];
  const readings = index >= 0 ? vitalReadings(days, index) : [];
  const summary = vitalsSummary(readings);
  const building = index >= 0 ? buildingProgress('normalRange', days, index) : null;
  const byId = new Map(readings.map((r) => [r.spec.id, r]));
  const shortLine = (term: TermId): string | undefined => {
    const key = TERMS[term].short;
    return key === null ? undefined : t(key);
  };

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await sync().catch(() => undefined);
    setRefreshing(false);
  };

  const tile = (reading: VitalReading, wide: boolean): ReactElement => {
    const shown = shownFor(reading, units, language, t(reading.spec.unitKey));
    const deviation = reading.spec.id === 'temp' && day !== undefined ? day.skinTempDeviationC.value : null;
    const tempDelta = deviation === null ? null : formatTemperatureDelta(deviation, units, language);
    return (
      <MetricTile
        key={reading.spec.id}
        testID={`vital-${reading.spec.id}`}
        label={t(reading.spec.labelKey)}
        value={reading.value}
        reason={reading.reason}
        level={reading.spec.level}
        unit={shown.unit}
        format={shown.value}
        size={wide ? 44 : 36}
        chip={rangeChip(t, language, reading.status, shown.baseline, reading.spec.decimals)}
        href={`/recovery/metric/${reading.spec.id}`}
        explain={{ term: reading.spec.term, index }}
        caption={tempDelta === null ? shortLine(reading.spec.term) : t('health.vitals.vsUsual', { value: tempDelta.value, unit: tempDelta.unit })}
        style={{ flex: 1 }}
      />
    );
  };

  const empty = day === undefined || summary.measured === 0;

  return (
    <HealthPage
      title={t('health.vitals.title')}
      testID="health-vitals"
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      right={<IconButton icon="file" label={t('health.hub.report')} onPress={() => router.push('/health/report')} color={colors.text} testID="vitals-report" />}
      hero={
        <View style={{ gap: spacing.md }}>
          <LiveHero />
          {day !== undefined && !empty ? (
            <AppText variant="capLarge" muted testID="vitals-last-night">
              {t('health.vitals.lastNightCap', { day: formatShortDay(day.day, language) })}
            </AppText>
          ) : (
            <AppText variant="lead" muted>
              {t('health.vitals.intro')}
            </AppText>
          )}
        </View>
      }>
      {empty ? (
        <StateCard icon="pulse" tone="neutral" title={t('empty.title')} body={t('health.vitals.empty')} testID="vitals-empty" />
      ) : (
        <View style={{ gap: spacing.md }}>
          {summary.judged > 0 && day !== undefined ? (
            <Card testID="vitals-summary" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ width: 48, height: 48, borderRadius: radius.sm, backgroundColor: summary.within === summary.judged ? colors.positiveSoft : colors.warningSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={summary.within === summary.judged ? 'check' : 'alert'} size={22} color={summary.within === summary.judged ? colors.positive : colors.warning} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="capLarge" color={summary.within === summary.judged ? colors.positive : colors.warning}>
                  {summary.within === summary.judged ? t('health.vitals.allWithin') : t('health.vitals.someOutside', { count: summary.judged - summary.within })}
                </AppText>
                <AppText variant="body" soft numeric testID="vitals-hero">
                  {t('health.vitals.summaryLine', { within: summary.within, judged: summary.judged, day: formatShortDay(day.day, language) })}
                </AppText>
              </View>
            </Card>
          ) : null}
          {building ? (
            <Card testID="vitals-calibrating" style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="target" size={20} color={colors.pink} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong">{t('health.vitals.calibratingTitle')}</AppText>
                  <AppText variant="label" muted testID="vitals-nights-left">
                    {t('health.vitals.nightsLeft', { count: remaining(building) })}
                  </AppText>
                </View>
              </View>
              <View testID="vitals-ranges-after" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
                <AppText variant="label" muted style={{ flexShrink: 1 }}>
                  {t('health.vitals.rangesAfter', { count: MIN_BASELINE_NIGHTS })}
                </AppText>
                <ProgressDots progress={building} />
              </View>
            </Card>
          ) : null}
          {building ? (
            <Card testID="vitals-list" style={{ paddingVertical: spacing.xs, gap: 0 }}>
              {readings.map((reading, i) => (
                <VitalRow
                  key={reading.spec.id}
                  reading={reading}
                  index={index}
                  shown={shownFor(reading, units, language, t(reading.spec.unitKey))}
                  last={i === readings.length - 1}
                  testID={`vital-${reading.spec.id}`}
                />
              ))}
            </Card>
          ) : (
            GRID.map((row) => (
              <View key={row.join('-')} style={{ flexDirection: 'row', gap: spacing.md }}>
                {row.map((id) => {
                  const reading = byId.get(id);
                  return reading === undefined ? null : tile(reading, row.length === 1);
                })}
              </View>
            ))
          )}
        </View>
      )}
      <BandStatus />
      <LevelNote level="B" text={t('health.vitals.levelNote')} testID="vitals-level" />
      <AppText variant="caption" muted>
        {t('explain.tapHint')}
      </AppText>
      <AppText variant="caption" muted>
        {t('health.vitals.footnote')}
      </AppText>
    </HealthPage>
  );
}
