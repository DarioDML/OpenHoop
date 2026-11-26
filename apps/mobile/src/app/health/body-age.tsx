import { router } from 'expo-router';
import { View } from 'react-native';

import {
  PHENO_WINDOW_DAYS,
  fitnessBand,
  latestFitnessAge,
  latestPhenoAge,
  type FitnessAgeView,
  type FitnessBand,
  type PhenoAgeView,
  type PhenoMarkerRow,
} from '@/data/bodyAgeDerived';
import { useAppData } from '@/data/context';
import { VO2_MIN_NIGHTS, VO2_WINDOW_NIGHTS } from '@/data/healthspanDerived';
import { formatConverted, formatEntered, parseBiomarkerKey } from '@/data/labs';
import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { markerName } from '@/ui/health/labsText';
import { MethodCard } from '@/ui/health/MethodCard';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';

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

export default function BodyAgeScreen() {
  const { t, language } = useT();
  const { days, profile, userData, labResults } = useAppData();
  const fmt: Format = (value, decimals = 0) => formatNumber(value, decimals, language);

  return (
    <HealthPage
      title={t('health.bodyAge.title')}
      testID="health-body-age"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.bodyAge.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.bodyAge.body')}
          </AppText>
        </View>
      }>
      <FitnessSection view={latestFitnessAge(days, profile, userData.sex)} fmt={fmt} />
      <PhenoSection view={latestPhenoAge(labResults, profile)} fmt={fmt} />
    </HealthPage>
  );
}
