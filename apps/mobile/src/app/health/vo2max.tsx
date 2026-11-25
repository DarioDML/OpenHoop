import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { VO2_MIN_NIGHTS, VO2_TREND_DAYS, VO2_WINDOW_NIGHTS, latestVo2, vo2Trend, type NormComparison } from '@/data/healthspanDerived';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { MethodCard } from '@/ui/health/MethodCard';
import { LineChart } from '@/ui/LineChart';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';

function normGroupLabel(t: TFunction, norm: NormComparison['norm']): string {
  const params = { from: norm.ageFrom, to: norm.ageTo ?? norm.ageFrom };
  if (norm.sex === 'male') return norm.ageTo === null ? t('health.vo2max.norm.maleOpen', params) : t('health.vo2max.norm.male', params);
  return norm.ageTo === null ? t('health.vo2max.norm.femaleOpen', params) : t('health.vo2max.norm.female', params);
}

export default function Vo2maxScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, profile, userData } = useAppData();
  const view = latestVo2(days, profile, userData.sex);
  const trend = vo2Trend(days, profile);
  const fmt = (value: number, decimals = 0): string => formatNumber(value, decimals, language);
  const unit = t('health.vo2max.unit');

  return (
    <HealthPage
      title={t('health.vo2max.title')}
      testID="health-vo2max"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.vo2max.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.vo2max.body')}
          </AppText>
        </View>
      }>
      <Card testID="vo2-card">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="capLarge" muted>
            {t('health.vo2max.estimate')}
          </AppText>
          <ParityBadge level={PARITY.vo2max} />
        </View>
        {view.result.ok ? (
          <View style={{ gap: spacing.sm }}>
            <Num size={52} unit={unit} unitSize={15} unitColor={colors.textMuted} testID="vo2-value">
              {fmt(view.result.value.vo2max)}
            </Num>
            <AppText variant="label" muted testID="vo2-error">
              {t('health.vo2max.error', { see: fmt(view.result.value.seeMlKgMin, 1) })}
            </AppText>
            {view.day !== null ? (
              <AppText variant="caption" muted>
                {t('health.vo2max.asOf', { day: formatShortDay(view.day, language) })}
              </AppText>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="body" muted testID="vo2-reason">
              {t(`health.vo2max.reason.${view.result.reason}`, { min: VO2_MIN_NIGHTS, window: VO2_WINDOW_NIGHTS, nights: view.result.nights })}
            </AppText>
            {view.result.reason === 'no-resting-hr' ? null : (
              <Button label={t('health.vo2max.editProfile')} variant="secondary" onPress={() => router.push('/profile/edit')} testID="vo2-edit-profile" />
            )}
          </View>
        )}
      </Card>

      {view.result.ok ? (
        <Section title={t('health.vo2max.norm.title')}>
          <Card testID="vo2-norm">
            {view.norm !== null ? (
              <>
                <AppText variant="bodyStrong" numeric testID="vo2-norm-value">
                  {t('health.vo2max.norm.value', {
                    group: normGroupLabel(t, view.norm.norm),
                    mean: fmt(view.norm.norm.mean, 1),
                    sd: fmt(view.norm.norm.sd, 1),
                    n: view.norm.norm.n,
                  })}
                </AppText>
                <AppText variant="body" soft testID="vo2-norm-position">
                  {t(`health.vo2max.norm.${view.norm.position}`)}
                </AppText>
                <AppText variant="caption" muted>
                  {t('health.vo2max.norm.source')}
                </AppText>
              </>
            ) : (
              <AppText variant="body" muted testID="vo2-norm-reason">
                {t(`health.vo2max.norm.reason.${view.normReason ?? 'no-age'}`)}
              </AppText>
            )}
          </Card>
        </Section>
      ) : null}

      <Section title={t('health.vo2max.trend.title')} hint={t('health.vo2max.trend.hint', { days: VO2_TREND_DAYS, window: VO2_WINDOW_NIGHTS })}>
        <Card testID="vo2-trend">
          <LineChart
            testID="vo2-chart"
            data={trend.points}
            formatTick={(value) => fmt(value)}
            emptyLabel={t('health.vo2max.trend.empty')}
            startLabel={trend.firstDay === null ? undefined : formatShortDay(trend.firstDay, language)}
            endLabel={trend.lastDay === null ? undefined : formatShortDay(trend.lastDay, language)}
            minSpan={4}
          />
        </Card>
      </Section>

      {view.result.ok ? (
        <ListGroup title={t('health.vo2max.inputs.title')}>
          <ListRow
            testID="vo2-input-rest"
            title={t('metric.restingHr')}
            subtitle={t('health.vo2max.inputs.restingHint', { nights: view.result.value.inputs.nights, window: VO2_WINDOW_NIGHTS })}
            value={`${fmt(view.result.value.inputs.restingHr, 1)} ${t('unit.bpm')}`}
          />
          <ListRow
            testID="vo2-input-max"
            title={t('health.vo2max.inputs.maxHr')}
            subtitle={
              view.result.value.inputs.maxHrSource === 'setting'
                ? t('health.vo2max.inputs.maxSetting')
                : t('health.vo2max.inputs.maxAge', { age: view.result.value.inputs.ageYears ?? '' })
            }
            value={`${fmt(view.result.value.inputs.maxHr, 1)} ${t('unit.bpm')}`}
          />
          <ListRow testID="vo2-input-formula" title={t('health.vo2max.inputs.formula')} value={t('health.vo2max.inputs.formulaValue')} />
        </ListGroup>
      ) : null}

      <MethodCard
        testID="vo2-method"
        level={PARITY.vo2max}
        title={t('health.vo2max.method.title')}
        lines={[
          t('health.vo2max.method.formula'),
          t('health.vo2max.method.limit1'),
          t('health.vo2max.method.limit2'),
          t('health.vo2max.method.limit3'),
          t('health.vo2max.method.limit4'),
        ]}
      />
    </HealthPage>
  );
}
