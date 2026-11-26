import type { Wrist } from '@openhoop/protocol';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData, useEcgLive } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Segmented } from '@/ui/controls';
import { EcgTrace } from '@/ui/health/EcgTrace';
import { HealthPage } from '@/ui/health/HealthPage';
import { ParityBadge } from '@/ui/ParityBadge';
import { StateCard } from '@/ui/StateCard';
import { spacing } from '@/ui/theme';

const DURATION_S = 30;

export default function EcgScreen() {
  const { t } = useT();
  const { device, ecgActions, ecgRecordings } = useAppData();
  const live = useEcgLive();
  const [wrist, setWrist] = useState<Wrist>('left');
  const isMg = device.model === 'MG';
  const busy = device.connection === 'syncing' || device.connection === 'connecting';

  const start = async (): Promise<void> => {
    const id = await ecgActions.start(wrist);
    if (id !== null) router.push({ pathname: '/health/ecg-result', params: { id: String(id) } });
  };

  const seconds = Math.min(DURATION_S, Math.floor(live.elapsedMs / 1000));

  return (
    <HealthPage
      title={t('health.ecg.title')}
      testID="health-ecg"
      hero={
        <View style={{ gap: spacing.sm }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.ecg.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.ecg.body')}
          </AppText>
        </View>
      }>
      {!isMg ? <StateCard icon="band" tone="pink" title={t('health.mg.needsTitle')} body={t('health.mg.needsBody')} testID="needs-mg" /> : null}

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="bodyStrong">{t('ecg.howTitle')}</AppText>
        <AppText variant="body" muted>
          {t('ecg.howBody')}
        </AppText>
      </Card>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="capSmall" muted>
          {t('ecg.wrist')}
        </AppText>
        <Segmented<Wrist>
          value={wrist}
          onChange={setWrist}
          options={[
            { value: 'left', label: t('ecg.wristLeft') },
            { value: 'right', label: t('ecg.wristRight') },
          ]}
          testID="ecg-wrist"
        />
      </View>

      {live.active ? (
        <Card testID="ecg-live" style={{ gap: spacing.sm }}>
          <AppText variant="bodyStrong" testID="ecg-elapsed">
            {t('ecg.recording', { seconds, total: DURATION_S })}
          </AppText>
          <EcgTrace samples={live.tail} testID="ecg-live-trace" />
          <AppText variant="label" muted>
            {live.samples === 0 ? t('ecg.waiting') : t('ecg.samples', { count: live.samples })}
          </AppText>
          <Button label={t('ecg.stop')} variant="secondary" onPress={() => ecgActions.stop()} testID="ecg-stop" />
        </Card>
      ) : (
        <Button label={t('ecg.start')} onPress={() => void start()} disabled={!isMg || busy} testID="ecg-start" />
      )}

      {ecgRecordings.length > 0 ? (
        <Button label={t('ecg.history', { count: ecgRecordings.length })} variant="tertiary" onPress={() => router.push('/health/ecg-result')} testID="ecg-history" />
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <ParityBadge level="D" />
        <AppText variant="label" muted style={{ flex: 1 }}>
          {t('ecg.levelD')}
        </AppText>
      </View>
      <AppText variant="caption" muted testID="mg-disclaimer">
        {t('health.mg.disclaimer')}
      </AppText>
    </HealthPage>
  );
}
