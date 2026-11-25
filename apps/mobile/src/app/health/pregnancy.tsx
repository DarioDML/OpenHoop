import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { TIMELINE_RANGES, nightlySeries, parseTimelineRange, pregnancyProgress, validateDueDay } from '@/data/cycle';
import type { MetricKey } from '@/data/derived';
import type { ParityLevel } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { todayIsoDate } from '@/lib/dates';
import { formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Field, Segmented } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { LineChart } from '@/ui/LineChart';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Section } from '@/ui/Section';
import { spacing } from '@/ui/theme';

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

export default function PregnancyScreen() {
  const { t, language } = useT();
  const { days, cycle, savePregnancy, removePregnancy } = useAppData();
  const pregnancy = cycle.pregnancy;
  const [due, setDue] = useState<string>(pregnancy?.dueDay ?? '');
  const [dueInvalid, setDueInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [range, setRange] = useState<string>('30');

  const today = todayIsoDate();
  const progress = pregnancy === null ? null : pregnancyProgress(pregnancy, today);
  const rangeDays = parseTimelineRange(range);

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

  return (
    <HealthPage
      title={t('health.pregnancy.title')}
      testID="health-pregnancy"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.pregnancy.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.pregnancy.body')}
          </AppText>
        </View>
      }>
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
              {progress.daysToDue >= 0
                ? t('health.pregnancy.week.daysTo', { count: progress.daysToDue })
                : t('health.pregnancy.week.daysSince', { count: -progress.daysToDue })}
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
              const latest = [...series].reverse().find((point) => point.value !== null);
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
                  {latest !== undefined && latest.value !== null ? (
                    <AppText variant="label" muted numeric testID={`pregnancy-latest-${spec.key}`}>
                      {t('health.pregnancy.trends.latest', { value: `${formatNumber(latest.value, spec.decimals, language)} ${t(spec.unit)}` })}
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
