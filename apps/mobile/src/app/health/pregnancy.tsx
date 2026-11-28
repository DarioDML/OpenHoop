import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { TIMELINE_RANGES, nightlySeries, parseTimelineRange, pregnancyProgress, validateDueDay } from '@/data/cycle';
import { baselineAt, metricValue, rangeStatus, type MetricKey } from '@/data/derived';
import { trimesterOf } from '@/data/pregnancyPrefs';
import type { ParityLevel } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { todayIsoDate } from '@/lib/dates';
import { formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import type { ChipTone } from '@/ui/Chip';
import { Button, Field, Segmented } from '@/ui/controls';
import { MetricName } from '@/ui/explain/MetricName';
import { HealthPage } from '@/ui/health/HealthPage';
import { Icon } from '@/ui/Icon';
import { LineChart } from '@/ui/LineChart';
import { ToggleRow } from '@/ui/manage/rows';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Section } from '@/ui/Section';
import { GridTile, StatGrid } from '@/ui/StatGrid';
import { spacing, useTheme } from '@/ui/theme';

interface TrendSpec {
  key: MetricKey;
  label: TranslationKey;
  unit: TranslationKey;
  decimals: number;
  level: ParityLevel;
  minSpan: number;
}

const TRENDS: readonly TrendSpec[] = [
  { key: 'restingHr', label: 'metric.restingHr', unit: 'unit.bpm', decimals: 0, level: PARITY.restingHr, minSpan: 6 },
  { key: 'hrv', label: 'metric.hrv', unit: 'unit.ms', decimals: 0, level: PARITY.hrv, minSpan: 10 },
  { key: 'skinTemp', label: 'metric.skinTemp', unit: 'unit.celsius', decimals: 1, level: PARITY.skinTemp, minSpan: 1 },
];

function hoursText(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

export default function PregnancyScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, cycle, userData, updateUserData, savePregnancy, removePregnancy } = useAppData();
  const pregnancy = cycle.pregnancy;
  const [due, setDue] = useState<string>(pregnancy?.dueDay ?? '');
  const [dueInvalid, setDueInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [range, setRange] = useState<string>('30');

  const today = todayIsoDate();
  const progress = pregnancy === null ? null : pregnancyProgress(pregnancy, today);
  const rangeDays = parseTimelineRange(range);
  const prefs = userData.pregnancyPrefs;
  const index = days.length - 1;
  const latest = days[index];
  const restingHr = latest === undefined ? null : metricValue(latest, 'restingHr');
  const hrStatus = rangeStatus(restingHr, index < 0 ? null : baselineAt(days, index, 'restingHr'));
  const asleep = latest === undefined ? null : metricValue(latest, 'asleepH');
  const need = latest === undefined ? null : metricValue(latest, 'sleepNeedH');

  const hrChip = ((): { label: string; tone: ChipTone } | null => {
    if (restingHr === null) return null;
    if (hrStatus === null) return { label: t('range.calibrating'), tone: 'neutral' };
    if (hrStatus === 'within') return { label: t('health.pregnancy.baseline.within'), tone: 'positive' };
    return { label: t(hrStatus === 'above' ? 'health.pregnancy.baseline.above' : 'health.pregnancy.baseline.below'), tone: 'neutral' };
  })();
  const sleepChip = asleep === null || need === null ? null : asleep >= need ? { label: t('health.pregnancy.baseline.onNeed'), tone: 'positive' as const } : { label: t('health.pregnancy.baseline.belowNeed'), tone: 'neutral' as const };

  const submit = async (): Promise<void> => {
    const result = validateDueDay(due, todayIsoDate());
    if (!result.ok) {
      setDueInvalid(true);
      return;
    }
    setSaving(true);
    const saved = await savePregnancy(result.dueDay);
    setSaving(false);
    if (saved) setDueInvalid(false);
  };

  const end = async (): Promise<void> => {
    setConfirmEnd(false);
    if (await removePregnancy()) setDue('');
  };

  const setPref = (change: Partial<typeof prefs>): void => {
    void updateUserData({ pregnancyPrefs: { ...prefs, ...change } });
  };

  const dueField = (
    <>
      <Field
        label={t('health.pregnancy.field.due')}
        hint={t('health.pregnancy.field.dueHint')}
        error={dueInvalid}
        value={due}
        onChangeText={(text) => {
          setDue(text);
          setDueInvalid(false);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="YYYY-MM-DD"
        testID="pregnancy-input-due"
      />
      <Button
        label={pregnancy === null ? t('health.pregnancy.action.start') : t('health.pregnancy.action.update')}
        onPress={() => void submit()}
        disabled={saving}
        testID="pregnancy-save"
      />
    </>
  );

  const ongoing = progress !== null && progress.stage === 'ongoing';

  const hero = (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="user" color={colors.pink} size={32} />
      </View>
      {pregnancy !== null && progress !== null ? (
        <>
          <Num size={56} testID="pregnancy-hero-week">
            {ongoing ? t('health.pregnancy.hero.week', { weeks: progress.weeks }) : t('health.pregnancy.hero.noWeek')}
          </Num>
          <AppText variant="body" color={colors.textSoft} style={{ textAlign: 'center' }} testID="pregnancy-hero-line">
            {ongoing
              ? t('health.pregnancy.hero.line', { trimester: t(`health.pregnancy.trimester.${trimesterOf(progress.weeks)}`), day: formatShortDay(pregnancy.dueDay, language) })
              : t('health.pregnancy.hero.due', { day: formatShortDay(pregnancy.dueDay, language) })}
          </AppText>
        </>
      ) : (
        <>
          <AppText variant="h2" accessibilityRole="header" style={{ textAlign: 'center' }}>
            {t('health.pregnancy.heading')}
          </AppText>
          <AppText variant="lead" muted style={{ textAlign: 'center' }}>
            {t('health.pregnancy.body')}
          </AppText>
        </>
      )}
    </View>
  );

  return (
    <HealthPage title={t('health.pregnancy.title')} tint="cycle" testID="health-pregnancy" hero={hero}>
      {pregnancy === null || progress === null ? (
        <Card testID="pregnancy-off">
          <AppText variant="bodyStrong">{t('health.pregnancy.off.title')}</AppText>
          <AppText variant="body" muted>
            {t('health.pregnancy.off.body')}
          </AppText>
          {dueField}
        </Card>
      ) : (
        <>
          <Card testID="pregnancy-baselines">
            <AppText variant="cardTitle">{t('health.pregnancy.baseline.title')}</AppText>
            <AppText variant="body" soft>
              {t('health.pregnancy.baseline.body')}
            </AppText>
          </Card>

          <StatGrid testID="pregnancy-tiles">
            <GridTile
              label={t('metric.restingHr')}
              value={restingHr === null ? null : formatNumber(restingHr, 0, language)}
              unit={t('unit.bpm')}
              missing={t('health.pregnancy.baseline.noValue')}
              chip={hrChip}
              header={<MetricName target={{ term: 'restingHr', index, shown: null }} label={t('metric.restingHr')} testID="pregnancy-rhr-name" />}
              testID="pregnancy-rhr"
            />
            <GridTile
              label={t('health.pregnancy.baseline.sleep')}
              value={asleep === null ? null : hoursText(asleep)}
              missing={t('health.pregnancy.baseline.noValue')}
              chip={sleepChip}
              header={<MetricName target={{ term: 'asleep', index, shown: null }} label={t('health.pregnancy.baseline.sleep')} testID="pregnancy-sleep-name" />}
              testID="pregnancy-sleep"
            />
          </StatGrid>

          <Card testID="pregnancy-toggles" style={{ gap: 0, paddingVertical: spacing.xs }}>
            <ToggleRow
              title={t('health.pregnancy.toggle.targets')}
              subtitle={t('health.pregnancy.toggle.targetsBody')}
              value={prefs.hideLoadTargets}
              onChange={(hideLoadTargets) => setPref({ hideLoadTargets })}
              testID="pregnancy-hide-targets"
            />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <ToggleRow
              title={t('health.pregnancy.toggle.weight')}
              subtitle={t('health.pregnancy.toggle.weightBody')}
              value={prefs.pauseWeightGoals}
              onChange={(pauseWeightGoals) => setPref({ pauseWeightGoals })}
              testID="pregnancy-pause-weight"
            />
          </Card>

          <Card testID="pregnancy-week">
            <AppText variant="capLarge" muted>
              {t('health.pregnancy.week.title')}
            </AppText>
            {progress.stage === 'ongoing' ? (
              <>
                <AppText variant="h1" numeric testID="pregnancy-week-value">
                  {t('health.pregnancy.week.value', { weeks: progress.weeks, days: progress.days })}
                </AppText>
                <AppText variant="caption" muted>
                  {t('health.pregnancy.week.caption')}
                </AppText>
              </>
            ) : (
              <AppText variant="body" testID="pregnancy-week-none">
                {progress.stage === 'before' ? t('health.pregnancy.week.before') : t('health.pregnancy.week.beyond')}
              </AppText>
            )}
            <AppText variant="label" muted numeric testID="pregnancy-due">
              {t('health.pregnancy.week.due', { day: pregnancy.dueDay })}
            </AppText>
            <AppText variant="label" muted numeric testID="pregnancy-days">
              {progress.daysToDue >= 0 ? t('health.pregnancy.week.daysTo', { count: progress.daysToDue }) : t('health.pregnancy.week.daysSince', { count: -progress.daysToDue })}
            </AppText>
          </Card>

          <Card testID="pregnancy-edit">{dueField}</Card>

          <Section title={t('health.pregnancy.trends.title')} hint={t('health.pregnancy.trends.hint')}>
            <Segmented
              testID="pregnancy-range"
              value={range}
              onChange={setRange}
              options={TIMELINE_RANGES.map((value) => ({ value: `${value}` as const, label: t(`health.cycle.range.${value}`) }))}
            />
            {TRENDS.map((spec) => {
              const series = nightlySeries(days, spec.key, today, rangeDays);
              const recent = [...series].reverse().find((point) => point.value !== null);
              return (
                <Card key={spec.key} testID={`pregnancy-trend-${spec.key}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <AppText variant="bodyStrong" style={{ flex: 1 }}>
                      {t(spec.label)}
                    </AppText>
                    <ParityBadge level={spec.level} />
                  </View>
                  <LineChart
                    data={series.map((point) => point.value)}
                    formatTick={(value) => formatNumber(value, spec.decimals, language)}
                    emptyLabel={t('health.pregnancy.trends.empty', { days: range })}
                    startLabel={formatShortDay(series[0]?.day ?? '', language)}
                    endLabel={formatShortDay(today, language)}
                    minSpan={spec.minSpan}
                    testID={`pregnancy-chart-${spec.key}`}
                  />
                  {recent !== undefined && recent.value !== null ? (
                    <AppText variant="label" muted numeric testID={`pregnancy-latest-${spec.key}`}>
                      {t('health.pregnancy.trends.latest', { value: `${formatNumber(recent.value, spec.decimals, language)} ${t(spec.unit)}` })}
                    </AppText>
                  ) : null}
                </Card>
              );
            })}
          </Section>

          <Card testID="pregnancy-end">
            <AppText variant="caption" muted>
              {t('health.pregnancy.privacy')}
            </AppText>
            {confirmEnd ? (
              <>
                <Button label={t('health.pregnancy.action.confirmEnd')} variant="danger" onPress={() => void end()} testID="pregnancy-end-confirm" />
                <Button label={t('health.pregnancy.action.keep')} variant="tertiary" onPress={() => setConfirmEnd(false)} testID="pregnancy-end-keep" />
              </>
            ) : (
              <Button label={t('health.pregnancy.action.end')} variant="secondary" onPress={() => setConfirmEnd(true)} testID="pregnancy-end-button" />
            )}
          </Card>
        </>
      )}
      <AppText variant="caption" muted testID="pregnancy-disclaimer">
        {t('health.pregnancy.disclaimer')}
      </AppText>
    </HealthPage>
  );
}
