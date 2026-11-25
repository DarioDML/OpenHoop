import { View } from 'react-native';

import { loadTargetBand, targetAdvice } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { rangeStatus } from '@/data/derived';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { NoDataScreen } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { NotBuilt } from '@/ui/NotBuilt';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

export default function LoadTargetScreen() {
  const { days } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const day = days[days.length - 1];
  if (!day) return <NoDataScreen title={t('loadx.target.screen')} />;

  const band = loadTargetBand(days);
  const status = rangeStatus(day.load.value, band);
  const advice = targetAdvice(day.readiness.value);
  const fmt = (v: number): string => formatNumber(v, 1, language);

  return (
    <Screen
      tint="load"
      header={
        <>
          <TopBar title={t('loadx.target.screen')} />
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="cap" muted>
              {t('loadx.target.today')}
            </AppText>
            {day.load.value === null ? (
              <AppText variant="body" muted>
                {t('reason.no-data')}
              </AppText>
            ) : (
              <Num size={72} color={colors.metric.loadBright} testID="target-load">
                {fmt(day.load.value)}
              </Num>
            )}
            {band ? (
              <AppText variant="body" soft>
                {t('loadx.target.usual', { low: fmt(band.low), high: fmt(band.high) })}
              </AppText>
            ) : null}
          </View>
        </>
      }>
      <Card>
        <AppText variant="cardTitle">{t('loadx.target.how.title')}</AppText>
        <AppText variant="body" muted>
          {t('loadx.target.how.body')}
        </AppText>
        {band ? (
          status ? (
            <Chip tone={status === 'within' ? 'positive' : 'info'} label={t(`range.${status}`, { low: fmt(band.low), high: fmt(band.high) })} />
          ) : null
        ) : (
          <Chip tone="warning" label={t('range.calibrating')} />
        )}
      </Card>

      <Card>
        <AppText variant="cardTitle">{t('loadx.target.advice.title')}</AppText>
        <AppText variant="body" muted testID="target-advice">
          {t(`loadx.target.advice.${advice}`)}
        </AppText>
      </Card>

      <NotBuilt issue="activities" body={t('loadx.target.live')} />

      <Card tone="outline">
        <ParityBadge level={PARITY.load} long />
        <AppText variant="label" muted>
          {t('loadx.levelNote')}
        </AppText>
      </Card>
    </Screen>
  );
}
