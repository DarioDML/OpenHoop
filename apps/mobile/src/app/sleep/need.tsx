import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatHm } from '@/data/dailyDerived';
import { mean, metricValue } from '@/data/derived';
import { needBreakdown, type NeedBreakdown } from '@/data/sleepDerived';
import { countKey } from '@/i18n';
import { useT, type TFunction } from '@/i18n/useT';
import { formatDuration, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Divider, NoDataPage, Page, StatRow } from '@/ui/daily/bits';
import { useExplain } from '@/ui/explain/ExplainProvider';
import { LevelNote } from '@/ui/LevelNote';
import { Num } from '@/ui/Num';
import { PARITY } from '@/ui/parity';
import { NeedBar, needColor, signedHm } from '@/ui/sleep/NeedBar';
import { needReasonKey } from '@/ui/sleep/needReason';
import { IconButton } from '@/ui/TopBar';
import { spacing, useTheme } from '@/ui/theme';

interface PartRow {
  id: 'baseline' | 'load' | 'debt' | 'naps' | 'other';
  title: string;
  hint: string;
  value: string;
}

function parts(t: TFunction, language: 'nl' | 'en', b: NeedBreakdown): PartRow[] {
  const rows: PartRow[] = [
    { id: 'baseline', title: t('sleepNeed.baseline'), hint: t('sleepNeed.baselineHint'), value: formatHm(b.baselineS) },
    {
      id: 'load',
      title: t('sleepNeed.load'),
      hint: b.load === null ? t('sleepNeed.loadNone') : t('sleepNeed.loadHint', { value: formatNumber(b.load, 1, language) }),
      value: signedHm(b.loadS, '+'),
    },
    { id: 'debt', title: t('sleepNeed.debt'), hint: t('sleepNeed.debtHint'), value: signedHm(b.debtS, '+') },
    {
      id: 'naps',
      title: t('sleepNeed.naps'),
      hint: b.napCount === 0 ? t('sleepNeed.napsNone') : b.napCount === 1 ? t('sleepNeed.napsOne') : t('sleepNeed.napsMany', { count: b.napCount }),
      value: signedHm(b.napsS, '−'),
    },
  ];
  if (b.otherS !== 0) rows.push({ id: 'other', title: t('sleepNeed.other'), hint: t('sleepNeed.otherHint'), value: signedHm(Math.abs(b.otherS), b.otherS > 0 ? '+' : '−') });
  return rows;
}

export default function SleepNeedScreen() {
  const { days } = useAppData();
  const { t, language, reason } = useT();
  const { colors } = useTheme();
  const explain = useExplain();
  const index = days.length - 1;
  const day = days[index];
  if (!day) return <NoDataPage title={t('metric.need')} body={t('empty.body')} />;

  const need = day.sleep.need.value;
  const debt = day.sleep.debt.value;
  const recent = days.slice(Math.max(0, index - 30), index).map((d) => metricValue(d, 'sleepNeedH'));
  const typical = mean(recent);
  const present = recent.filter((v) => v !== null).length;
  const breakdown = needBreakdown(days, index);
  const rows = breakdown === null ? [] : parts(t, language, breakdown);

  return (
    <Page
      title={t('metric.need')}
      tint="sleep"
      testID="sleep-need"
      right={
        <IconButton
          icon="info"
          label={t('sleepNeed.info')}
          testID="need-info"
          onPress={() => explain.about({ term: 'sleepNeed', index, shown: { value: need === null ? null : formatHm(need), unit: null, reason: day.sleep.need.reason } })}
        />
      }
      hero={
        <View style={{ gap: spacing.sm }}>
          <AppText variant="cap" color={colors.textSoft}>
            {t('sleepx.needTonight')}
          </AppText>
          {need === null ? (
            <AppText variant="title" muted testID="need-reason">
              {t(needReasonKey(day.sleep.need.reason))}
            </AppText>
          ) : (
            <>
              <Num size={88} testID="need-value">
                {formatHm(need)}
              </Num>
              <AppText variant="label" color={colors.textSoft}>
                {t('sleepNeed.toWake')}
              </AppText>
            </>
          )}
        </View>
      }>
      {breakdown !== null && need !== null ? (
        <>
          <Card style={{ gap: spacing.md }} testID="need-bar-card">
            <NeedBar breakdown={breakdown} height={18} testID="need-bar" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="caption" muted>
                {t('sleepNeed.axisStart')}
              </AppText>
              <AppText variant="caption" muted numeric>
                {formatHm(need)}
              </AppText>
            </View>
          </Card>

          <Card style={{ gap: 0, paddingVertical: spacing.xs }} testID="need-parts">
            {rows.map((row, i) => (
              <View
                key={row.id}
                testID={`need-part-${row.id}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, paddingVertical: spacing.sm, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                <View
                  style={
                    row.id === 'naps'
                      ? { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, borderColor: colors.textMuted }
                      : { width: 12, height: 12, borderRadius: 3, backgroundColor: needColor(colors, row.id) }
                  }
                />
                <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                  <AppText variant="bodyStrong">
                    {row.title}
                  </AppText>
                  <AppText variant="label" muted>
                    {row.hint}
                  </AppText>
                </View>
                <Num size={24} testID={`need-part-${row.id}-value`}>
                  {row.value}
                </Num>
              </View>
            ))}
          </Card>
        </>
      ) : (
        <Card testID="need-no-breakdown">
          <AppText variant="body" muted>
            {t(needReasonKey(day.sleep.need.reason))}
          </AppText>
        </Card>
      )}

      <Card style={{ gap: 0 }} testID="need-recent">
        <CardHeader title={t('sleepNeed.recent')} />
        <StatRow
          label={t('sleepx.typicalNeed')}
          caption={t(countKey(present, 'sleepx.typicalNeedHintOne', 'sleepx.typicalNeedHint'), { count: present })}
          value={typical === null ? reason('needs-history') : formatHm(typical * 3600)}
          testID="typical-need"
        />
        <Divider />
        <StatRow label={t('sleepNeed.debtNow')} caption={t('sleepx.debtHint')} value={debt === null ? reason(day.sleep.debt.reason) : formatDuration(t, debt)} testID="debt" />
        <Divider />
        <StatRow label={t('sleepx.lastAsleep')} value={day.sleep.asleepS === null ? reason('no-sleep') : formatDuration(t, day.sleep.asleepS)} />
      </Card>

      <LevelNote level={PARITY.sleepNeed} text={t('sleepNeed.level')} testID="need-level" />
    </Page>
  );
}
