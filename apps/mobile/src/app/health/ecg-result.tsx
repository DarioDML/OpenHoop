import type { EcgSummary } from '@openhoop/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { singleParam } from '@/data/dailyDerived';
import { ECG_STRIP_S, ecgStrips } from '@/data/ecg';
import { shareEcgCsv } from '@/data/ecgShare';
import { useT, type TFunction } from '@/i18n/useT';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { formatClock, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { EcgTrace } from '@/ui/health/EcgTrace';
import { HealthPage } from '@/ui/health/HealthPage';
import { KeyValueRow } from '@/ui/manage/rows';
import { ParityBadge } from '@/ui/ParityBadge';
import { StateCard } from '@/ui/StateCard';
import { spacing, useTheme } from '@/ui/theme';

function when(language: 'nl' | 'en', unixS: number): string {
  const tz = deviceTzOffsetS(new Date(unixS * 1000));
  return `${formatShortDay(unixToIsoDate(unixS, tz), language)} ${formatClock(unixS, tz)}`;
}

function wristText(t: TFunction, recording: EcgSummary): string {
  if (recording.wrist === null) return t('band.unknown');
  return t(recording.wrist === 'left' ? 'ecg.wristLeft' : 'ecg.wristRight');
}

export default function EcgResultScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { ecgRecordings, ecgActions, heartRateBetween } = useAppData();
  const params = useLocalSearchParams<{ id?: string }>();
  const wanted = Number(singleParam(params.id) ?? NaN);
  const [picked, setPicked] = useState<number | null>(null);
  const selected = ecgRecordings.find((r) => r.id === (picked ?? wanted)) ?? ecgRecordings[0] ?? null;
  const [loaded, setLoaded] = useState<{ id: number; samples: number[] | null; avgHr: number | null } | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    void (async () => {
      const samples = await ecgActions.samples(selected.id);
      const hr = await heartRateBetween(selected.t, selected.t + Math.ceil(selected.durationMs / 1000), 1);
      const avgHr = hr.length === 0 ? null : Math.round(hr.reduce((sum, point) => sum + point.hr, 0) / hr.length);
      if (!cancelled) setLoaded({ id: selected.id, samples, avgHr });
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, ecgActions, heartRateBetween]);

  const current = selected !== null && loaded?.id === selected.id ? loaded : null;

  const share = async (): Promise<void> => {
    if (selected === null || current?.samples == null) return;
    setSharing(true);
    try {
      await shareEcgCsv(selected, current.samples);
    } catch {
      Alert.alert(t('ecg.shareFailed'));
    } finally {
      setSharing(false);
    }
  };

  const remove = (): void => {
    if (selected === null) return;
    Alert.alert(t('ecg.deleteTitle'), t('ecg.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('ecg.delete'), style: 'destructive', onPress: () => void ecgActions.remove(selected.id).then(() => setPicked(null)) },
    ]);
  };

  return (
    <HealthPage
      title={t('health.ecgResult.title')}
      testID="health-ecg-result"
      hero={
        <View style={{ gap: spacing.sm }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.ecgResult.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.ecgResult.body')}
          </AppText>
        </View>
      }>
      {selected === null ? (
        <StateCard icon="pulse" tone="pink" title={t('ecg.none.title')} body={t('ecg.none.body')} actionLabel={t('ecg.start')} onAction={() => router.push('/health/ecg')} testID="ecg-none" />
      ) : (
        <>
          <Card style={{ gap: spacing.xs }} testID="ecg-summary">
            <KeyValueRow label={t('ecg.recorded')} value={when(language, selected.t)} />
            <KeyValueRow label={t('ecg.length')} value={t('ecg.seconds', { seconds: Math.round(selected.durationMs / 1000) })} />
            <KeyValueRow label={t('ecg.wrist')} value={wristText(t, selected)} />
            <KeyValueRow label={t('ecg.rate')} value={selected.rateHz === null ? t('band.unknown') : t('ecg.rateValue', { rate: Math.round(selected.rateHz) })} />
            <KeyValueRow label={t('ecg.sampleCount')} value={String(selected.sampleCount)} />
            <KeyValueRow
              label={t('ecg.bandHr')}
              value={current?.avgHr == null ? t('ecg.bandHrNone') : t('ecg.bandHrValue', { bpm: current.avgHr })}
              testID="ecg-band-hr"
            />
            <AppText variant="caption" muted>
              {t('ecg.bandHrNote')}
            </AppText>
          </Card>

          <Card style={{ gap: spacing.md }} testID="ecg-strips">
            <AppText variant="capSmall" muted>
              {t('ecg.strips', { seconds: ECG_STRIP_S })}
            </AppText>
            {current === null ? (
              <AppText variant="label" muted>
                {t('ecg.loading')}
              </AppText>
            ) : current.samples === null || current.samples.length === 0 ? (
              <AppText variant="label" muted>
                {t('ecg.unreadable')}
              </AppText>
            ) : (
              ecgStrips(current.samples, selected.rateHz, selected.durationMs).map((strip, i) => <EcgTrace key={i} samples={strip} height={72} testID={`ecg-strip-${i}`} />)
            )}
          </Card>

          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <ParityBadge level="D" />
            <AppText variant="label" muted style={{ flex: 1 }}>
              {t('ecg.levelD')}
            </AppText>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Button label={sharing ? t('ecg.sharing') : t('ecg.share')} variant="secondary" onPress={() => void share()} disabled={sharing || current?.samples == null} testID="ecg-share" />
            <Button label={t('ecg.delete')} variant="tertiary" onPress={remove} testID="ecg-delete" />
          </View>

          {ecgRecordings.length > 1 ? (
            <Card style={{ gap: 0 }} testID="ecg-history-list">
              <AppText variant="capSmall" muted>
                {t('ecg.historyTitle')}
              </AppText>
              {ecgRecordings.map((recording) => (
                <Pressable
                  key={recording.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: recording.id === selected.id }}
                  onPress={() => setPicked(recording.id)}
                  testID={`ecg-item-${recording.id}`}
                  style={{ minHeight: 44, justifyContent: 'center' }}>
                  <AppText variant="body" color={recording.id === selected.id ? colors.accent : undefined}>
                    {`${when(language, recording.t)} · ${t('ecg.seconds', { seconds: Math.round(recording.durationMs / 1000) })}`}
                  </AppText>
                </Pressable>
              ))}
            </Card>
          ) : null}
        </>
      )}
      <AppText variant="caption" muted testID="mg-disclaimer">
        {t('health.mg.disclaimer')}
      </AppText>
    </HealthPage>
  );
}
