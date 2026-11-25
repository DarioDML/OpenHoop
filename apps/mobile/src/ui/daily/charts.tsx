import type { DayRecord } from '@openhoop/core';
import { View } from 'react-native';

import { mean } from '@/data/derived';
import type { TrendRange } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { formatNumber, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Segmented } from '@/ui/controls';
import { LineChart } from '@/ui/LineChart';
import { ParityBadge } from '@/ui/ParityBadge';
import { spacing } from '@/ui/theme';
import type { ParityLevel } from '@/data/types';

const RANGES: readonly TrendRange[] = ['1W', '1M', '6M'];

export function RangeSwitch({ value, onChange }: { value: TrendRange; onChange: (value: TrendRange) => void }) {
  const { t } = useT();
  return (
    <Segmented<TrendRange>
      testID="range-switch"
      value={value}
      onChange={onChange}
      options={RANGES.map((range) => ({ value: range, label: t(`daily.range.${range}`) }))}
    />
  );
}

interface TrendCardProps {
  title: string;
  slice: readonly DayRecord[];
  pick: (day: DayRecord) => number | null;
  decimals: number;
  minSpan: number;
  level?: ParityLevel;
  color?: string;
  band?: { low: number; high: number } | null;
  unit?: string;
  testID: string;
  height?: number;
}

export function TrendCard({ title, slice, pick, decimals, minSpan, level, color, band = null, unit, testID, height }: TrendCardProps) {
  const { t, language } = useT();
  const values = slice.map(pick);
  const average = mean(values);
  const first = slice[0];
  const last = slice[slice.length - 1];
  return (
    <Card style={{ gap: spacing.md }} testID={`card-${testID}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <AppText variant="bodyStrong">{title}</AppText>
          {level ? <ParityBadge level={level} /> : null}
        </View>
        {average !== null ? (
          <AppText variant="label" muted numeric testID={`avg-${testID}`}>
            {t('trends.average', { value: `${formatNumber(average, decimals, language)}${unit ? ` ${unit}` : ''}` })}
          </AppText>
        ) : null}
      </View>
      <LineChart
        testID={`chart-${testID}`}
        data={values}
        height={height}
        minSpan={minSpan}
        color={color}
        band={band}
        formatTick={(v) => formatNumber(v, decimals, language)}
        emptyLabel={t('trends.noValues')}
        startLabel={first ? formatShortDay(first.day, language) : undefined}
        endLabel={last ? formatShortDay(last.day, language) : undefined}
      />
    </Card>
  );
}
