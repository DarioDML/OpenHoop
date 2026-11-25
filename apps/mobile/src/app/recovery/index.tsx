import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { sliceEndingAt } from '@/data/dailyDerived';
import { baselineAt } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { BarChart } from '@/ui/BarChart';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Divider, NoDataPage, Page, StatRow, usePercentChip } from '@/ui/daily/bits';
import { METRIC_SLUGS, METRIC_SPECS } from '@/ui/daily/metrics';
import { FlagNotice } from '@/ui/FlagNotice';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { ScoreRing } from '@/ui/ScoreRing';
import { SignedBar } from '@/ui/SignedBar';
import { readinessBand, readinessColor, spacing, useTheme } from '@/ui/theme';

export default function ReadinessScreen() {
  const { days } = useAppData();
  const { t, language, reason } = useT();
  const { colors } = useTheme();
  const percentChip = usePercentChip();
  const index = days.length - 1;
  const day = days[index];
  if (!day) return <NoDataPage title={t('screen.readiness')} body={t('empty.body')} />;

  const value = day.readiness.value;
  const band = readinessBand(value);
  const contributions = day.readinessContributions;
  const scale = contributions ? Math.max(15, ...Object.values(contributions).map((v) => Math.abs(v))) : 15;
  const week = sliceEndingAt(days, 7, index);
  const sleepBaseline = baselineAt(days, index, 'sleepScore');
  const sleepChip = percentChip(day.sleep.score.value, sleepBaseline);

  return (
    <Page
      title={t('screen.readiness')}
      tint="recovery"
      testID="recovery"
      hero={
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <ScoreRing
            testID="ring-readiness-detail"
            label={t('score.readiness')}
            value={value}
            max={100}
            level={PARITY.readiness}
            reason={day.readiness.reason}
            calibrating={day.readinessCalibrating}
            color={readinessColor(colors, value)}
            size={168}
            strokeWidth={14}
          />
          {!day.readinessCalibrating && band ? (
            <Chip label={t(`readiness.${band}`)} tone={band === 'high' ? 'positive' : band === 'medium' ? 'warning' : 'negative'} testID="band-chip" />
          ) : null}
        </View>
      }>
      <FlagNotice flags={day.flags} />
      {day.readinessCalibrating ? (
        <Card tone="warning" testID="calibrating-hint">
          <AppText variant="label">{t('calibrating.hint')}</AppText>
        </Card>
      ) : null}

      <Card testID="card-contributions" style={{ gap: spacing.lg }}>
        <View style={{ gap: 2 }}>
          <AppText variant="cardTitle">{t('readiness.contributions')}</AppText>
          <AppText variant="label" muted>
            {t('readiness.contributionsHint')}
          </AppText>
        </View>
        {contributions ? (
          <>
            <SignedBar label={t('readiness.contrib.hrv')} value={contributions.hrv} scale={scale} />
            <SignedBar label={t('readiness.contrib.sleep')} value={contributions.sleep} scale={scale} />
            <SignedBar label={t('readiness.contrib.rhr')} value={contributions.rhr} scale={scale} />
          </>
        ) : (
          <AppText variant="bodyStrong" muted>
            {reason(day.readiness.reason)}
          </AppText>
        )}
      </Card>

      <Card testID="card-vs-baseline" style={{ gap: 0 }}>
        <CardHeader title={t('readinessx.vsBaseline')} />
        {METRIC_SLUGS.map((slug, i) => {
          const spec = METRIC_SPECS[slug];
          const derived = spec.pick(day);
          const chip = percentChip(derived.value, baselineAt(days, index, spec.key));
          return (
            <View key={slug}>
              {i > 0 ? <Divider /> : null}
              <StatRow
                testID={`row-${slug}`}
                label={t(spec.label)}
                value={derived.value === null ? reason(derived.reason) : `${formatNumber(derived.value, spec.decimals, language)} ${t(spec.unit)}`}
                right={chip ? <Chip label={chip.label} tone={chip.tone} small /> : undefined}
                href={`/recovery/metric/${slug}`}
              />
            </View>
          );
        })}
        <Divider />
        <StatRow
          testID="row-sleep"
          label={t('score.sleep')}
          value={day.sleep.score.value === null ? reason(day.sleep.score.reason) : `${formatNumber(day.sleep.score.value, 0, language)}%`}
          right={sleepChip ? <Chip label={sleepChip.label} tone={sleepChip.tone} small /> : undefined}
          href="/sleep"
        />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <CardHeader title={t('readinessx.last7')} action={`${t('readinessx.trends')} ›`} href="/recovery/trends" />
        <BarChart
          testID="chart-readiness-week"
          data={week.map((d) => d.readiness.value)}
          max={100}
          formatTick={(v) => formatNumber(v, 0, language)}
          startLabel={week[0] ? formatShortDay(week[0].day, language) : undefined}
          endLabel={formatShortDay(day.day, language)}
        />
      </Card>

      <Card style={{ gap: 0 }}>
        <StatRow label={t('readinessx.impacts')} value="" href="/recovery/impacts" testID="link-impacts" />
        <Divider />
        <StatRow label={t('readinessx.trends')} value="" href="/recovery/trends" testID="link-trends" />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="cardTitle">{t('readiness.howTitle')}</AppText>
        <AppText variant="body" muted>
          {t('readiness.howBody')}
        </AppText>
      </Card>

      <Card tone="warning" style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <ParityBadge level={PARITY.readiness} long />
        </View>
        <AppText variant="bodyStrong">{t('readiness.modelTitle')}</AppText>
        <AppText variant="body" muted>
          {t('readiness.modelBody')}
        </AppText>
      </Card>
    </Page>
  );
}
