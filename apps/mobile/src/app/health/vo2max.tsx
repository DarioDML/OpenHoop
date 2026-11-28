import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import {
  FITNESS_LEVELS,
  VO2_MIN_NIGHTS,
  VO2_TREND_DAYS,
  VO2_WINDOW_NIGHTS,
  fitnessLevel,
  latestVo2,
  scalePosition,
  vo2Trend,
  type FitnessLevel,
  type NormComparison,
} from '@/data/healthspanDerived';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { MethodCard } from '@/ui/health/MethodCard';
import { LevelNote } from '@/ui/LevelNote';
import { LineChart } from '@/ui/LineChart';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { PARITY } from '@/ui/parity';
import { radius, spacing, useTheme, type ColorTokens } from '@/ui/theme';

function normGroupLabel(t: TFunction, norm: NormComparison['norm']): string {
  const params = { from: norm.ageFrom, to: norm.ageTo ?? norm.ageFrom };
  if (norm.sex === 'male') return norm.ageTo === null ? t('health.vo2max.norm.maleOpen', params) : t('health.vo2max.norm.male', params);
  return norm.ageTo === null ? t('health.vo2max.norm.femaleOpen', params) : t('health.vo2max.norm.female', params);
}

function classLine(t: TFunction, level: FitnessLevel, norm: NormComparison['norm']): string {
  const params = { level: t(`health.vo2max.level.${level}`), from: norm.ageFrom, to: norm.ageTo ?? norm.ageFrom };
  if (norm.sex === 'male') return norm.ageTo === null ? t('health.vo2max.level.lineMaleOpen', params) : t('health.vo2max.level.lineMale', params);
  return norm.ageTo === null ? t('health.vo2max.level.lineFemaleOpen', params) : t('health.vo2max.level.lineFemale', params);
}

function levelColor(colors: ColorTokens, level: FitnessLevel): string {
  switch (level) {
    case 'poor':
      return colors.negative;
    case 'fair':
      return colors.warning;
    case 'good':
      return colors.gold;
    case 'excellent':
      return colors.positive;
    case 'superior':
      return colors.zones[1];
  }
}

function LevelScale({ vo2max, norm }: { vo2max: number; norm: NormComparison['norm'] }): ReactElement {
  const { t, language } = useT();
  const { colors } = useTheme();
  const view = fitnessLevel(vo2max, norm);
  const position = scalePosition(vo2max, view);
  return (
    <View style={{ gap: spacing.sm }} accessible accessibilityLabel={classLine(t, view.level, norm)} testID="vo2-scale">
      <View style={{ height: 22, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {FITNESS_LEVELS.map((level) => (
            <View
              key={level}
              testID={level === view.level ? `vo2-scale-${level}-current` : `vo2-scale-${level}`}
              style={{ flex: 1, height: level === view.level ? 18 : 10, borderRadius: radius.pill, backgroundColor: levelColor(colors, level), opacity: level === view.level ? 1 : 0.75 }}
            />
          ))}
        </View>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: `${position * 100}%`, marginLeft: -2, width: 4, height: 22, borderRadius: 2, backgroundColor: colors.primary }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {FITNESS_LEVELS.map((level) => (
          <AppText
            key={level}
            variant="caption"
            color={level === view.level ? colors.text : colors.textMuted}
            style={{ flex: 1, textAlign: 'center', fontWeight: level === view.level ? '700' : '500' }}
            numberOfLines={2}>
            {t(`health.vo2max.level.${level}`)}
          </AppText>
        ))}
      </View>
      <AppText variant="caption" muted numeric>
        {t('health.vo2max.level.cuts', { a: formatNumber(view.cuts[0], 1, language), b: formatNumber(view.cuts[1], 1, language), c: formatNumber(view.cuts[2], 1, language), d: formatNumber(view.cuts[3], 1, language) })}
      </AppText>
    </View>
  );
}

export default function Vo2maxScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, profile, userData } = useAppData();
  const view = latestVo2(days, profile, userData.sex);
  const trend = vo2Trend(days, profile);
  const fmt = (value: number, decimals = 0): string => formatNumber(value, decimals, language);
  const unit = t('health.vo2max.unit');
  const level = view.result.ok && view.norm !== null ? fitnessLevel(view.result.value.vo2max, view.norm.norm).level : null;

  return (
    <HealthPage
      title={t('health.vo2max.title')}
      testID="health-vo2max"
      hero={
        <View style={{ gap: spacing.sm }} testID="vo2-card">
          <AppText variant="capLarge" muted>
            {t('health.vo2max.estimated')}
          </AppText>
          {view.result.ok ? (
            <>
              <Num size={96} unit={unit} unitSize={36} unitColor={colors.textMuted} testID="vo2-value">
                {fmt(view.result.value.vo2max)}
              </Num>
              {level !== null && view.norm !== null ? (
                <AppText variant="lead" testID="vo2-class">
                  {classLine(t, level, view.norm.norm)}
                </AppText>
              ) : (
                <AppText variant="label" muted testID="vo2-class-reason">
                  {t(`health.vo2max.norm.reason.${view.normReason ?? 'no-age'}`)}
                </AppText>
              )}
            </>
          ) : (
            <>
              <AppText variant="body" muted testID="vo2-reason">
                {t(`health.vo2max.reason.${view.result.reason}`, { min: VO2_MIN_NIGHTS, window: VO2_WINDOW_NIGHTS, nights: view.result.nights })}
              </AppText>
              {view.result.reason === 'no-resting-hr' ? null : (
                <Button label={t('health.vo2max.editProfile')} variant="secondary" onPress={() => router.push('/profile/edit')} testID="vo2-edit-profile" />
              )}
            </>
          )}
        </View>
      }>
      {view.result.ok ? (
        <Card testID="vo2-norm">
          <AppText variant="capLarge" muted>
            {t('health.vo2max.level.title')}
          </AppText>
          {view.norm !== null ? (
            <>
              <LevelScale vo2max={view.result.value.vo2max} norm={view.norm.norm} />
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
                {t('health.vo2max.level.method')}
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
      ) : null}

      <Card testID="vo2-trend">
        <AppText variant="capLarge" muted>
          {t('health.vo2max.trend.cap', { days: VO2_TREND_DAYS })}
        </AppText>
        <LineChart
          testID="vo2-chart"
          data={trend.points}
          formatTick={(value) => fmt(value)}
          emptyLabel={t('health.vo2max.trend.empty')}
          startLabel={trend.firstDay === null ? undefined : formatShortDay(trend.firstDay, language)}
          endLabel={trend.lastDay === null ? undefined : formatShortDay(trend.lastDay, language)}
          color={colors.zones[1]}
          minSpan={4}
        />
        <AppText variant="caption" muted>
          {t('health.vo2max.trend.hint', { days: VO2_TREND_DAYS, window: VO2_WINDOW_NIGHTS })}
        </AppText>
      </Card>

      {view.result.ok ? (
        <>
          <AppText variant="label" muted testID="vo2-error">
            {t('health.vo2max.error', { see: fmt(view.result.value.seeMlKgMin, 1) })}
          </AppText>
          {view.day !== null ? (
            <AppText variant="caption" muted>
              {t('health.vo2max.asOf', { day: formatShortDay(view.day, language) })}
            </AppText>
          ) : null}
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
        </>
      ) : null}

      <AppText variant="body" muted>
        {t('health.vo2max.body')}
      </AppText>
      <LevelNote level={PARITY.vo2max} text={t('health.vo2max.levelNote')} testID="vo2-level" />
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
