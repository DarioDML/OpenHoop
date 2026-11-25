import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatHm } from '@/data/dailyDerived';
import { mean, metricValue } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { formatDuration } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Divider, NoDataPage, Page, StatRow } from '@/ui/daily/bits';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { spacing } from '@/ui/theme';

export default function SleepNeedScreen() {
  const { days } = useAppData();
  const { t, reason } = useT();
  const index = days.length - 1;
  const day = days[index];
  if (!day) return <NoDataPage title={t('metric.need')} body={t('empty.body')} />;

  const need = day.sleep.need.value;
  const debt = day.sleep.debt.value;
  const recent = days.slice(Math.max(0, index - 30), index).map((d) => metricValue(d, 'sleepNeedH'));
  const typical = mean(recent);
  const present = recent.filter((v) => v !== null).length;

  return (
    <Page
      title={t('metric.need')}
      tint="sleep"
      testID="sleep-need"
      hero={
        <View style={{ gap: 6 }}>
          <AppText variant="capSmall" muted>
            {t('sleepx.needTonight')}
          </AppText>
          {need === null ? (
            <AppText variant="cardTitle" muted>
              {reason(day.sleep.need.reason)}
            </AppText>
          ) : (
            <Num size={64} testID="need-value">
              {formatHm(need)}
            </Num>
          )}
        </View>
      }>
      <Card style={{ gap: 0 }}>
        <StatRow
          label={t('sleepx.typicalNeed')}
          caption={t('sleepx.typicalNeedHint', { count: present })}
          value={typical === null ? reason('needs-history') : formatHm(typical * 3600)}
          testID="typical-need"
        />
        <Divider />
        <StatRow label={t('metric.debt')} caption={t('sleepx.debtHint')} value={debt === null ? reason(day.sleep.debt.reason) : formatDuration(t, debt)} testID="debt" />
        <Divider />
        <StatRow label={t('sleepx.lastAsleep')} value={day.sleep.asleepS === null ? reason('no-sleep') : formatDuration(t, day.sleep.asleepS)} />
      </Card>
      <Card tone="outline" style={{ gap: spacing.sm }}>
        <ParityBadge level={PARITY.sleepNeed} long />
        <AppText variant="caption" muted>
          {t('sleepx.needNote')}
        </AppText>
      </Card>
    </Page>
  );
}
