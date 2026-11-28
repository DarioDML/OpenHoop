import { router } from 'expo-router';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import {
  PACE_MIN_DAYS,
  PACE_SCALE,
  PHENO_WINDOW_DAYS,
  bodyAgeHeadline,
  fitnessBand,
  latestFitnessAge,
  latestPhenoAge,
  paceOfAging,
  phenoAgeHistory,
  yearsDifference,
  type BodyAgeHeadline,
  type FitnessAgeView,
  type FitnessBand,
  type PaceOfAging,
  type PhenoAgeView,
  type PhenoMarkerRow,
} from '@/data/bodyAgeDerived';
import { useAppData } from '@/data/context';
import { CONTRIBUTOR_WINDOW_DAYS, bodyAgeContributors, type Contributor } from '@/data/contributors';
import { VO2_MIN_NIGHTS, VO2_WINDOW_NIGHTS } from '@/data/healthspanDerived';
import { formatConverted, formatEntered, parseBiomarkerKey } from '@/data/labs';
import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { formatNumber, todayIso } from '@/lib/format';
import { useUnits } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { useExplain } from '@/ui/explain/ExplainProvider';
import { CONTRIBUTOR_NAME, contributorReason, contributorTone, contributorValue } from '@/ui/health/contributorText';
import { DotCloud } from '@/ui/health/DotCloud';
import { HealthPage } from '@/ui/health/HealthPage';
import { bodyAgeMissing } from '@/ui/health/hubTiles';
import { markerName } from '@/ui/health/labsText';
import { MethodCard } from '@/ui/health/MethodCard';
import { useLayout } from '@/ui/layout';
import { LevelNote } from '@/ui/LevelNote';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

type Format = (value: number, decimals?: number) => string;

function bandText(t: TFunction, band: FitnessBand, fmt: Format): string {
  if (band.kind === 'range') return t('health.bodyAge.fitness.range', { low: fmt(band.low), high: fmt(band.high) });
  if (band.kind === 'below') return t('health.bodyAge.fitness.below', { age: fmt(band.age) });
  if (band.kind === 'above') return t('health.bodyAge.fitness.above', { age: fmt(band.age) });
  return t('health.bodyAge.fitness.wide', { low: fmt(band.low), high: fmt(band.high) });
}

function fitnessReason(t: TFunction, view: FitnessAgeView): string {
  if (!view.vo2.ok) return t(`health.vo2max.reason.${view.vo2.reason}`, { min: VO2_MIN_NIGHTS, window: VO2_WINDOW_NIGHTS, nights: view.vo2.nights });
  if (view.reason === 'out-of-range' || view.reason === null) return t('health.vo2max.reason.out-of-range');
  return t(`health.vo2max.norm.reason.${view.reason}`);
}

function CardHeader({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <AppText variant="capLarge" muted>
        {title}
      </AppText>
      <ParityBadge level={PARITY.bodyAge} />
    </View>
  );
}

function FitnessSection({ view, fmt }: { view: FitnessAgeView; fmt: Format }) {
  const { t } = useT();
  const { colors } = useTheme();
  const { fitness } = view;
  const band = fitness === null ? null : fitnessBand(fitness);
  const years = t('health.bodyAge.years');
  return (
    <Section title={t('health.bodyAge.fitness.title')}>
      <Card testID="body-age-fitness">
        <CardHeader title={t('health.bodyAge.fitness.label')} />
        {fitness !== null ? (
          <View style={{ gap: spacing.sm }}>
            {band?.kind === 'range' ? (
              <Num size={44} unit={years} unitSize={15} unitColor={colors.textMuted} testID="body-age-fitness-value">
                {bandText(t, band, fmt)}
              </Num>
            ) : band !== null ? (
              <AppText variant="h2" testID="body-age-fitness-value">
                {bandText(t, band, fmt)}
              </AppText>
            ) : null}
            <AppText variant="label" muted testID="body-age-fitness-band">
              {t('health.bodyAge.fitness.bandNote', { see: fmt(fitness.seeMlKgMin, 1) })}
            </AppText>
            {view.ageYears !== null ? (
              <AppText variant="caption" muted testID="body-age-fitness-own-age">
                {t('health.bodyAge.ownAge', { age: view.ageYears })}
              </AppText>
            ) : null}
          </View>
        ) : (
          <AppText variant="body" muted testID="body-age-fitness-reason">
            {fitnessReason(t, view)}
          </AppText>
        )}
        <AppText variant="body" soft>
          {t('health.bodyAge.fitness.meaning')}
        </AppText>
        {fitness === null && view.vo2.ok ? (
          <Button label={t('health.vo2max.editProfile')} variant="secondary" onPress={() => router.push('/profile/edit')} testID="body-age-fitness-profile" />
        ) : null}
      </Card>
      {fitness !== null ? (
        <ListGroup title={t('health.bodyAge.inputs')}>
          <ListRow
            testID="body-age-fitness-vo2"
            title={t('health.vo2max.estimate')}
            subtitle={t('health.vo2max.error', { see: fmt(fitness.seeMlKgMin, 1) })}
            value={`${fmt(fitness.vo2max, 1)} ${t('health.vo2max.unit')}`}
          />
          <ListRow
            testID="body-age-fitness-norms"
            title={t('health.bodyAge.fitness.norms')}
            value={t(fitness.sex === 'male' ? 'health.bodyAge.fitness.men' : 'health.bodyAge.fitness.women')}
          />
        </ListGroup>
      ) : null}
      <ListGroup>
        <ListRow testID="body-age-vo2max" title={t('health.hub.vo2max')} subtitle={t('health.hub.vo2maxHint')} href="/health/vo2max" />
      </ListGroup>
      <MethodCard
        testID="body-age-fitness-method"
        level={PARITY.bodyAge}
        title={t('health.bodyAge.method')}
        lines={[t('health.bodyAge.fitness.method1'), t('health.bodyAge.fitness.method2'), t('health.bodyAge.fitness.method3')]}
      />
    </Section>
  );
}

function markerSubtitle(t: TFunction, row: PhenoMarkerRow, view: PhenoAgeView, language: Language): string {
  if (row.latest === null) return t('health.bodyAge.pheno.missing');
  if (row.status === 'unit') return t('health.bodyAge.pheno.unit', { day: row.latest.day });
  if (row.status === 'stale') return t('health.bodyAge.pheno.stale', { day: row.latest.day, window: PHENO_WINDOW_DAYS, newest: view.newestDay ?? '' });
  if (row.value !== null && row.latest.unit !== row.unit) {
    return t('health.bodyAge.pheno.converted', { day: row.latest.day, value: formatConverted(row.value, language), unit: row.unit });
  }
  return row.latest.day;
}

function phenoReason(t: TFunction, view: PhenoAgeView): string | null {
  if (view.result.ok) return null;
  const { reason } = view.result;
  if (reason === 'incomplete') {
    const names = view.markers.filter((m) => m.status !== 'ok').map((m) => markerName(parseBiomarkerKey(m.id), t));
    return t('health.bodyAge.pheno.reason.incomplete', { window: PHENO_WINDOW_DAYS, markers: names.join(', ') });
  }
  return t(`health.bodyAge.pheno.reason.${reason}`);
}

function PhenoSection({ view, fmt }: { view: PhenoAgeView; fmt: Format }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const reason = phenoReason(t, view);
  const dates =
    view.oldestDay === null || view.newestDay === null
      ? null
      : view.oldestDay === view.newestDay
        ? t('health.bodyAge.pheno.dateOne', { day: view.newestDay })
        : t('health.bodyAge.pheno.dates', { from: view.oldestDay, to: view.newestDay });
  return (
    <Section title={t('health.bodyAge.pheno.title')}>
      <Card testID="body-age-pheno">
        <CardHeader title={t('health.bodyAge.pheno.label')} />
        {view.result.ok ? (
          <View style={{ gap: spacing.sm }}>
            <Num size={52} unit={t('health.bodyAge.years')} unitSize={15} unitColor={colors.textMuted} testID="body-age-pheno-value">
              {fmt(view.result.value.phenoAge)}
            </Num>
            {view.ageYears !== null ? (
              <AppText variant="label" muted testID="body-age-pheno-age">
                {t('health.bodyAge.pheno.ageAtDraw', { age: view.ageYears })}
              </AppText>
            ) : null}
          </View>
        ) : (
          <AppText variant="body" muted testID="body-age-pheno-reason">
            {reason}
          </AppText>
        )}
        {dates !== null ? (
          <AppText variant="caption" muted testID="body-age-pheno-dates">
            {dates}
          </AppText>
        ) : null}
        <AppText variant="body" soft>
          {t('health.bodyAge.pheno.meaning')}
        </AppText>
        {!view.result.ok && view.result.reason === 'no-age' ? (
          <Button label={t('health.vo2max.editProfile')} variant="secondary" onPress={() => router.push('/profile/edit')} testID="body-age-pheno-profile" />
        ) : (
          <Button label={t('health.labs.add')} icon="plus" variant="secondary" onPress={() => router.push('/health/labs-upload')} testID="body-age-pheno-add" />
        )}
      </Card>
      <ListGroup title={t('health.bodyAge.pheno.inputs', { window: PHENO_WINDOW_DAYS })}>
        {view.markers.map((row) => (
          <ListRow
            key={row.id}
            testID={`body-age-pheno-${row.id}`}
            title={markerName(parseBiomarkerKey(row.id), t)}
            subtitle={markerSubtitle(t, row, view, language)}
            value={row.latest === null ? '—' : `${formatEntered(row.latest.value, language)} ${row.latest.unit}`}
            href={{ pathname: '/health/biomarker', params: { id: row.id } }}
          />
        ))}
      </ListGroup>
      <MethodCard
        testID="body-age-pheno-method"
        level={PARITY.bodyAge}
        title={t('health.bodyAge.method')}
        lines={[
          t('health.bodyAge.pheno.method1'),
          t('health.bodyAge.pheno.method2'),
          t('health.bodyAge.pheno.method3'),
          t('health.bodyAge.pheno.method4'),
        ]}
      />
    </Section>
  );
}

function PaceCard({ pace }: { pace: PaceOfAging }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const span = PACE_SCALE.max - PACE_SCALE.min;
  const at = (value: number): number => Math.min(1, Math.max(0, (value - PACE_SCALE.min) / span));
  return (
    <Card testID="body-age-pace">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <AppText variant="capLarge" muted style={{ flexShrink: 1 }}>
          {t('health.bodyAge.pace.title')}
        </AppText>
        {pace.ok ? (
          <Num size={30} testID="body-age-pace-value">
            {t('health.bodyAge.pace.value', { value: formatNumber(pace.pace, 1, language) })}
          </Num>
        ) : null}
      </View>
      <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={{ height: 28, justifyContent: 'center' }}>
        {width > 0 ? (
          <Svg width={width} height={28}>
            <Defs>
              <LinearGradient id="pace" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.positive} />
                <Stop offset="0.5" stopColor={colors.textMuted} />
                <Stop offset="1" stopColor={colors.negative} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={8} width={width} height={12} rx={6} fill="url(#pace)" opacity={pace.ok ? 1 : 0.35} />
            {pace.ok ? <Circle cx={6 + at(pace.pace) * (width - 12)} cy={14} r={11} fill={colors.primary} stroke={colors.background} strokeWidth={3} /> : null}
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[PACE_SCALE.min, 1, PACE_SCALE.max].map((tick) => (
          <AppText key={tick} variant="caption" muted numeric>
            {t('health.bodyAge.pace.value', { value: formatNumber(tick, 1, language) })}
          </AppText>
        ))}
      </View>
      <AppText variant="label" muted testID="body-age-pace-note">
        {pace.ok
          ? t('health.bodyAge.pace.between', { from: pace.from.day, to: pace.to.day })
          : t(`health.bodyAge.pace.reason.${pace.reason}`, { days: PACE_MIN_DAYS, draws: pace.draws })}
      </AppText>
    </Card>
  );
}

function Hero({ headline }: { headline: BodyAgeHeadline }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { width, gutter } = useLayout();
  const size = Math.min(280, width - gutter * 2);
  const diff = yearsDifference(headline);
  const missing = headline.kind === 'age' ? null : bodyAgeMissing(headline, t);
  return (
    <View style={{ gap: spacing.md, alignItems: 'center' }}>
      <DotCloud size={size} testID="body-age-cloud">
        {headline.kind === 'age' ? (
          <Num size={88} testID="body-age-value">
            {formatNumber(headline.age, 1, language)}
          </Num>
        ) : (
          <AppText variant="title" style={{ textAlign: 'center', maxWidth: size - 80 }} testID="body-age-missing">
            {missing}
          </AppText>
        )}
        <AppText variant="capLarge" style={{ marginTop: spacing.xs }}>
          {t('health.bodyAge.title')}
        </AppText>
      </DotCloud>
      {diff !== null ? (
        <AppText variant="lead" color={diff >= 0 ? colors.positive : colors.warning} testID="body-age-diff" style={{ textAlign: 'center' }}>
          {Math.abs(diff) < 0.05
            ? t('health.bodyAge.sameAsAge')
            : t(diff > 0 ? 'health.bodyAge.youngerThanAge' : 'health.bodyAge.olderThanAge', { years: formatNumber(Math.abs(diff), 1, language) })}
        </AppText>
      ) : null}
      <AppText variant="label" muted style={{ textAlign: 'center' }} testID="body-age-source">
        {headline.kind === 'none' ? t('health.bodyAge.body') : headline.source === 'pheno' ? t('health.bodyAge.sourcePheno') : t('health.bodyAge.sourceFitness')}
      </AppText>
    </View>
  );
}

function Contributors({ list }: { list: readonly Contributor[] }) {
  const { t, language } = useT();
  const units = useUnits();
  const text = { t, language, units };
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="capLarge" muted style={{ marginTop: spacing.sm }}>
        {t('health.bodyAge.contributors', { count: list.length, weeks: CONTRIBUTOR_WINDOW_DAYS / 7 })}
      </AppText>
      <ListGroup>
        {list.map((c) => {
          const value = contributorValue(c, text);
          return (
            <ListRow
              key={c.id}
              testID={`body-age-contrib-${c.id}`}
              title={t(CONTRIBUTOR_NAME[c.id])}
              subtitle={value === null ? contributorReason(c, t) : undefined}
              right={value === null ? undefined : <Chip label={value} tone={contributorTone(c)} testID={`body-age-contrib-${c.id}-value`} />}
              href={{ pathname: '/health/pillar', params: { contributor: c.id } }}
            />
          );
        })}
      </ListGroup>
    </View>
  );
}

export default function BodyAgeScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const explain = useExplain();
  const { days, profile, userData, labResults, bodyMeasurements, strength } = useAppData();
  const fmt: Format = (value, decimals = 0) => formatNumber(value, decimals, language);
  const fitness = latestFitnessAge(days, profile, userData.sex);
  const pheno = latestPhenoAge(labResults, profile);
  const headline = bodyAgeHeadline(fitness, pheno);
  const pace = paceOfAging(phenoAgeHistory(labResults, profile));
  const contributors = bodyAgeContributors({ days, profile, sex: userData.sex, sessions: strength.sessions, bodyMeasurements, today: todayIso(new Date(Date.now())) });

  return (
    <HealthPage
      title={t('health.bodyAge.title')}
      testID="health-body-age"
      right={
        <IconButton
          icon="info"
          label={t('health.bodyAge.aboutLabel')}
          onPress={() => explain.about({ term: 'bodyAge', index: days.length - 1, shown: null })}
          color={colors.text}
          testID="body-age-about"
        />
      }
      hero={<Hero headline={headline} />}>
      <PaceCard pace={pace} />
      <Contributors list={contributors} />
      <ListGroup>
        <ListRow testID="body-age-pillars" title={t('health.hub.pillars')} subtitle={t('health.hub.pillarsHint')} href="/health/pillar" />
      </ListGroup>
      <FitnessSection view={fitness} fmt={fmt} />
      <PhenoSection view={pheno} fmt={fmt} />
      <LevelNote level={PARITY.bodyAge} text={t('health.bodyAge.levelNote')} testID="body-age-level" />
    </HealthPage>
  );
}
