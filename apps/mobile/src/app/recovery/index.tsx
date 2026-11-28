import type { DayRecord, Derived } from '@openhoop/core';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { loadTargetBand } from '@/data/activityDerived';
import { loadTargetsHidden } from '@/data/pregnancyPrefs';
import { useAppData } from '@/data/context';
import { sliceEndingAt } from '@/data/dailyDerived';
import { pastDayOf, useDayIndex, withDay } from '@/ui/daily/useDayParam';
import { baselineAt, shownLoad, visibleReadiness, type MetricKey } from '@/data/derived';
import { buildingProgress, remaining } from '@/data/progress';
import { contributorDelta, loadAimRange, readinessVerdict, type ContributorDelta, type ContributorId } from '@/data/readinessDerived';
import type { TermId } from '@/data/terms';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { formatTemperatureDelta, temperatureDeltaIn, temperatureUnit, useUnits } from '@/lib/units';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import type { ChipTone } from '@/ui/Chip';
import { CapRow, NoDataPage, Page } from '@/ui/daily/bits';
import { useExplain, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { FlagNotice } from '@/ui/FlagNotice';
import { LevelNote } from '@/ui/LevelNote';
import { MissingValue } from '@/ui/MetricTile';
import { PARITY } from '@/ui/parity';
import { ContributorRow } from '@/ui/readiness/ContributorRow';
import { weekdayShort } from '@/ui/readiness/format';
import { LoadTargetCard } from '@/ui/readiness/LoadTargetCard';
import { ScoreRing, type BuildingRing } from '@/ui/ScoreRing';
import { SignedBar } from '@/ui/SignedBar';
import { readinessBand, readinessColor, spacing, useTheme, type Tint } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';
import { ValueBars } from '@/ui/ValueBars';

interface ContributorSpec {
  id: ContributorId;
  label: TranslationKey;
  term: TermId;
  key: MetricKey;
  decimals: number;
  unit: TranslationKey | null;
  href: string;
  pick: (day: DayRecord) => Derived;
}

const CONTRIBUTORS: readonly ContributorSpec[] = [
  { id: 'hrv', label: 'readinessShort.hrv', term: 'hrv', key: 'hrv', decimals: 0, unit: 'unit.ms', href: '/recovery/metric/hrv', pick: (d) => d.hrv },
  { id: 'rhr', label: 'readinessShort.rhr', term: 'restingHr', key: 'restingHr', decimals: 0, unit: 'unit.bpm', href: '/recovery/metric/rhr', pick: (d) => d.restingHr },
  { id: 'sleep', label: 'readinessShort.sleep', term: 'sleepScore', key: 'sleepScore', decimals: 0, unit: 'unit.percent', href: '/sleep', pick: (d) => d.sleep.score },
  { id: 'resp', label: 'readinessShort.resp', term: 'respiratoryRate', key: 'respiratoryRate', decimals: 1, unit: 'unit.perMin', href: '/recovery/metric/resp', pick: (d) => d.respiratoryRate },
  { id: 'spo2', label: 'readinessShort.spo2', term: 'spo2', key: 'spo2', decimals: 1, unit: 'unit.percent', href: '/recovery/metric/spo2', pick: (d) => d.spo2 },
];

const BAND_TINT: Readonly<Record<'high' | 'medium' | 'low', Tint>> = { high: 'recoveryHigh', medium: 'recovery', low: 'recoveryLow' };

export default function ReadinessScreen() {
  const { days, userData, cycle } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const units = useUnits();
  const explain = useExplain();
  const index = useDayIndex(days);
  const pastDay = pastDayOf(days, index);
  const day = days[index];
  if (!day) return <NoDataPage title={t('screen.readiness')} body={t('empty.body')} />;

  const visible = visibleReadiness(day);
  const value = visible.value;
  const progress = buildingProgress('readiness', days, index);
  const building: BuildingRing | null = progress === null ? null : { left: remaining(progress), have: progress.have, need: progress.need };
  const readinessTarget: ExplainTarget = { term: 'readiness', index, shown: { value: value === null ? null : formatNumber(value, 0, language), unit: null, reason: visible.reason } };
  const band = readinessBand(value);
  const contributions = day.readinessContributions;
  const scale = contributions ? Math.max(15, ...Object.values(contributions).map((v) => Math.abs(v))) : 15;
  const week = sliceEndingAt(days, 7, index);
  const verdict = building === null ? readinessVerdict(value, contributions) : null;
  const verdictText =
    verdict === null
      ? null
      : verdict.band === 'high'
        ? t('readinessScreen.verdict.high')
        : `${verdict.driver === null ? t(`readinessScreen.verdict.plain.${verdict.band}`) : t(`readinessScreen.verdict.driver.${verdict.driver}`)} ${t(`readinessScreen.verdict.advice.${verdict.band}`)}`;
  const targetsHidden = loadTargetsHidden(userData.pregnancyPrefs, cycle);
  const aim = targetsHidden ? null : loadAimRange(loadTargetBand(days), value);

  const deltaChip = (delta: ContributorDelta | null, format: (amount: number, percent: boolean) => string): { label: string; tone: ChipTone } | null => {
    if (delta === null) return null;
    if (delta.kind === 'normal') return { label: t('readinessScreen.delta.normal'), tone: 'neutral' };
    return { label: t(`readinessScreen.delta.${delta.word}`, { value: format(delta.amount, delta.percent) }), tone: delta.tone };
  };

  const rows = CONTRIBUTORS.map((spec) => {
    const derived = spec.pick(day);
    const baseline = baselineAt(days, index, spec.key);
    const unit = spec.unit === null ? undefined : t(spec.unit);
    const shown = derived.value === null ? null : formatNumber(derived.value, spec.decimals, language);
    const chip = deltaChip(contributorDelta(spec.id, derived.value, baseline), (amount, percent) =>
      percent ? `${formatNumber(amount, 0, language)}%` : formatNumber(amount, spec.decimals, language),
    );
    return {
      id: spec.id,
      name: t(spec.label),
      caption: baseline === null ? t('readinessScreen.baselineNone') : t('readinessScreen.baseline', { value: `${formatNumber(baseline.mean, spec.decimals, language)}${unit === undefined ? '' : unit === '%' ? '%' : ` ${unit}`}` }),
      value: shown,
      unit,
      chip,
      href: withDay(spec.href, pastDay),
      explain: { term: spec.term, index, shown: { value: shown, unit: unit ?? null, reason: derived.reason } },
    };
  });

  const deviation = day.skinTempDeviationC;
  const deviationShown = deviation.value === null ? null : formatTemperatureDelta(deviation.value, units, language);
  const tempChip = deltaChip(contributorDelta('temp', day.skinTempC.value, baselineAt(days, index, 'skinTemp')), (amount) => `${formatNumber(temperatureDeltaIn(amount, units), 1, language)} ${temperatureUnit(units)}`);
  rows.push({
    id: 'temp',
    name: t('readinessShort.temp'),
    caption: t('readinessScreen.tempCaption'),
    value: deviationShown?.value ?? null,
    unit: deviationShown?.unit,
    chip: tempChip,
    href: withDay('/recovery/metric/temp', pastDay),
    explain: { term: 'skinTempChange', index, shown: { value: deviationShown?.value ?? null, unit: deviationShown?.unit ?? null, reason: deviation.reason } },
  });

  return (
    <Page
      title={t('screen.readiness')}
      tint={band === null ? 'recovery' : BAND_TINT[band]}
      testID="recovery"
      right={<IconButton icon="info" label={t('explain.whatIs', { name: t('score.readiness') })} onPress={() => explain.about(readinessTarget)} testID="readiness-about" />}
      hero={
        <View style={{ alignItems: 'center', gap: 18 }}>
          <ScoreRing
            testID="ring-readiness-detail"
            label={t('score.readiness')}
            value={value}
            max={100}
            level={PARITY.readiness}
            reason={visible.reason}
            building={building}
            onExplain={() => explain.why(readinessTarget)}
            color={readinessColor(colors, value)}
            size={200}
            strokeWidth={10}
            unit="%"
            sublabel={band === null || day.readinessCalibrating ? undefined : t(`readiness.${band}`)}
            numberSize={96}
            unitSize={43}
            sublabelSize={13}
            showLabel={false}
          />
          {verdictText === null ? null : (
            <AppText variant="body" soft style={{ textAlign: 'center', maxWidth: 300 }} testID="readiness-verdict">
              {verdictText}
            </AppText>
          )}
        </View>
      }>
      <FlagNotice flags={day.flags} />

      <LoadTargetCard aim={aim} hidden={targetsHidden} load={shownLoad(days, index).value} testID="card-load-target" />

      <CapRow title={t('readinessScreen.contributors')} links={[{ label: t('readinessScreen.impactsLink'), onPress: () => router.push('/recovery/impacts'), testID: 'link-impacts' }]} />
      <Card testID="card-vs-baseline" style={{ gap: 0, paddingVertical: spacing.xs }}>
        {rows.map((row, i) => (
          <ContributorRow
            key={row.id}
            testID={`row-${row.id}`}
            name={row.name}
            caption={row.caption}
            value={row.value}
            unit={row.unit}
            chip={row.chip}
            href={row.href}
            explain={row.explain}
            divider={i < rows.length - 1}
          />
        ))}
      </Card>

      <Card testID="card-contributions" style={{ gap: spacing.lg }}>
        <View style={{ gap: 2 }}>
          <AppText variant="cardTitle">{t('readiness.contributions')}</AppText>
          <AppText variant="label" muted>
            {t('readiness.contributionsHint')}
          </AppText>
        </View>
        {contributions && value !== null ? (
          <>
            <SignedBar label={t('readiness.contrib.hrv')} value={contributions.hrv} scale={scale} />
            <SignedBar label={t('readiness.contrib.sleep')} value={contributions.sleep} scale={scale} />
            <SignedBar label={t('readiness.contrib.rhr')} value={contributions.rhr} scale={scale} />
          </>
        ) : (
          <MissingValue target={readinessTarget} testID="contributions" />
        )}
      </Card>

      <Card testID="card-week" style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="cap" muted accessibilityRole="header">
            {t('readinessx.last7')}
          </AppText>
          <Pressable testID="link-trends" accessibilityRole="link" hitSlop={8} onPress={() => router.push('/recovery/trends')} style={{ minHeight: 32, justifyContent: 'center' }}>
            <AppText variant="capSmall" muted>
              {t('readinessScreen.trendsLink')}
            </AppText>
          </Pressable>
        </View>
        <ValueBars
          testID="chart-readiness-week"
          max={100}
          height={64}
          highlight={week.length - 1}
          bars={week.map((d) => {
            const v = visibleReadiness(d).value;
            const rounded = v === null ? null : Math.round(v);
            return { key: d.day, value: rounded, display: rounded === null ? undefined : formatNumber(rounded, 0, language), label: weekdayShort(d.day, language), color: readinessColor(colors, rounded) };
          })}
        />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="cardTitle">{t('readiness.howTitle')}</AppText>
        <AppText variant="body" muted>
          {t('readiness.howBody')}
        </AppText>
      </Card>

      <LevelNote level={PARITY.readiness} text={t('readinessScreen.levelNote')} testID="readiness-level" />
    </Page>
  );
}
