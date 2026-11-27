import { SLEEP_STAGES, type SleepStage, type StageTotals } from '@openhoop/analytics';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { formatHm } from '@/data/dailyDerived';
import { asleepFromTotals, rangeFlag, typicalStageRanges, type Range } from '@/data/sleepDerived';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Num } from '@/ui/Num';
import { stageColor } from '@/ui/StageSplit';
import { radius, spacing, useTheme } from '@/ui/theme';

const ORDER: readonly SleepStage[] = ['wake', 'light', 'deep', 'rem'];
const BAR_H = 10;
const HOUR_S = 3600;

function Hatch({ id, color, width, height }: { id: string; color: string; width: number | string; height: number }): ReactElement {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={6} stroke={color} strokeWidth={2} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

export function StageLegend({ testID }: { testID?: string }): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  const order: readonly SleepStage[] = ['wake', 'rem', 'light', 'deep'];
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {order.map((stage) => (
        <View key={stage} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: stageColor(colors, stage) }} />
          <AppText variant="caption" muted>
            {t(`stage.${stage}`)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function stageLabel(stage: SleepStage): TranslationKey {
  return stage === 'deep' ? 'lastNight.deep' : `stage.${stage}`;
}

function StageRow({ stage, seconds, range, share, scaleS }: { stage: SleepStage; seconds: number; range: Range; share: number | null; scaleS: number }): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  const flag = rangeFlag(seconds, range);
  const pct = (value: number): number => Math.min(100, Math.max(0, (value / scaleS) * 100));
  const low = pct(range.low);
  const high = pct(range.high);
  return (
    <View style={{ gap: 6 }} testID={`time-in-stage-${stage}-row`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexShrink: 1 }}>
          <AppText variant="cap">{t(stageLabel(stage))}</AppText>
          {share === null ? null : (
            <AppText variant="caption" muted numeric>
              {t('lastNight.stagePct', { pct: share })}
            </AppText>
          )}
        </View>
        <Num size={20} testID={`time-in-stage-${stage}`}>
          {formatHm(seconds)}
        </Num>
      </View>
      <View
        accessible
        accessibilityLabel={`${t(stageLabel(stage))} ${formatHm(seconds)}, ${t('lastNight.typicalRange')} ${formatHm(range.low)}–${formatHm(range.high)}`}
        style={{ height: BAR_H, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct(seconds)}%`, borderRadius: radius.pill, backgroundColor: stageColor(colors, stage) }} />
        <View style={{ position: 'absolute', left: `${low}%`, width: `${Math.max(1, high - low)}%`, top: 0, bottom: 0 }} testID={`time-in-stage-${stage}-typical`}>
          <Hatch id={`hatch-${stage}`} color={colors.textMuted} width="100%" height={BAR_H} />
        </View>
      </View>
      {flag === null ? null : (
        <AppText variant="caption" color={colors.warning} testID={`time-in-stage-${stage}-flag`}>
          {t(flag === 'above' ? 'lastNight.above' : 'lastNight.below', { low: formatHm(range.low), high: formatHm(range.high) })}
        </AppText>
      )}
    </View>
  );
}

export function TimeInStage({ totals, testID = 'card-time-in-stage' }: { totals: StageTotals; testID?: string }): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  const ranges = typicalStageRanges(totals);
  const asleep = asleepFromTotals(totals);
  const top = Math.max(...SLEEP_STAGES.map((s) => Math.max(totals[s], ranges[s].high)), HOUR_S);
  const hours = Math.ceil(top / HOUR_S);
  return (
    <Card testID={testID} style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="cap" muted accessibilityRole="header">
          {t('lastNight.timeInStage')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 16, height: 10, borderRadius: 2, overflow: 'hidden' }}>
            <Hatch id="hatch-legend" color={colors.textMuted} width={16} height={10} />
          </View>
          <AppText variant="caption" muted>
            {t('lastNight.typicalRange')}
          </AppText>
        </View>
      </View>
      {ORDER.map((stage) => (
        <StageRow
          key={stage}
          stage={stage}
          seconds={totals[stage]}
          range={ranges[stage]}
          share={stage === 'wake' || asleep <= 0 ? null : Math.round((totals[stage] / asleep) * 100)}
          scaleS={hours * HOUR_S}
        />
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="caption" muted>
          {t('lastNight.axisStart')}
        </AppText>
        <AppText variant="caption" muted>
          {t('lastNight.axisEnd', { hours })}
        </AppText>
      </View>
      <AppText variant="caption" muted testID={`${testID}-note`}>
        {t('lastNight.typicalNote')}
      </AppText>
    </Card>
  );
}
